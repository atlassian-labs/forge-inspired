import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import {
  DEFAULT_TEMPLATE,
  SUPPORTED_PLACEHOLDERS,
  renderTemplate,
} from '../templates';

const CONFIG_INDEX_KEY = 'configuredProjects';
const configKey = (projectKey) => `config:${projectKey}`;
const auditKey = (projectKey) => `audit:${projectKey}`;

/**
 * One-shot migration flag. When we ship the opt-in ("enabled") model we wipe
 * every pre-existing per-project config + audit row so that no space silently
 * keeps firing on Done. The flag is set once per install so the wipe never
 * repeats.
 */
const MIGRATION_V2_KEY = 'migration:v2:optInDone';

const resolver = new Resolver();

/**
 * Idempotent, install-scoped wipe. Called at the top of every resolver so the
 * global page picks it up on first open after upgrade. Safe to invoke on cold
 * starts — a set KVS flag short-circuits the whole function.
 */
async function ensureMigrationV2() {
  const done = await kvs.get(MIGRATION_V2_KEY);
  if (done) return;
  const configured = (await kvs.get(CONFIG_INDEX_KEY)) || [];
  for (const pk of configured) {
    await kvs.delete(configKey(pk));
    await kvs.delete(auditKey(pk));
  }
  await kvs.delete(CONFIG_INDEX_KEY);
  await kvs.set(MIGRATION_V2_KEY, { at: Date.now(), wiped: configured.length });
}

// -----------------------------------------------------------------------------
// Resolve project key from context or payload
// -----------------------------------------------------------------------------

function resolveProjectKey(context, payload) {
  return (
    payload?.projectKey ||
    context?.extension?.project?.key ||
    context?.extension?.projectKey ||
    null
  );
}

// -----------------------------------------------------------------------------
// Projects — list every Jira "space" (project) the calling user can see.
// The global config page uses this to render its space picker.
// -----------------------------------------------------------------------------

resolver.define('getProjects', async () => {
  // Piggy-back the one-shot v2 wipe onto the first resolver call.
  await ensureMigrationV2();
  try {
    const res = await api
      .asUser()
      .requestJira(route`/rest/api/3/project/search?maxResults=200&orderBy=name`);
    if (!res.ok) return { ok: false, error: `Jira returned ${res.status}` };
    const json = await res.json();
    const projects = (json.values || []).map((p) => ({
      key: p.key,
      name: p.name,
      avatarUrl: p.avatarUrls?.['24x24'] || null,
    }));
    return { ok: true, projects };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// -----------------------------------------------------------------------------
// Statuses — list statuses available in a project so the user can pick one
// as the trigger.
// -----------------------------------------------------------------------------

resolver.define('getStatuses', async ({ context, payload }) => {
  const projectKey = resolveProjectKey(context, payload);
  if (!projectKey) return { ok: false, error: 'No project selected.' };
  try {
    const res = await api
      .asUser()
      .requestJira(route`/rest/api/3/project/${projectKey}/statuses`);
    if (!res.ok) return { ok: false, error: `Jira returned ${res.status}` };
    const json = await res.json();
    // Flatten: one status may appear under several issue types; dedupe by id.
    const seen = new Map();
    for (const issueType of Array.isArray(json) ? json : []) {
      for (const status of issueType.statuses || []) {
        if (!seen.has(status.id)) {
          seen.set(status.id, {
            id: status.id,
            name: status.name,
            statusCategoryKey: status.statusCategory?.key || 'undefined',
            statusCategoryName: status.statusCategory?.name || '',
          });
        }
      }
    }
    // Sort: Done-category first, then in-flight, then to-do.
    const order = { done: 0, indeterminate: 1, 'to-do': 2, new: 2 };
    const statuses = Array.from(seen.values()).sort(
      (a, b) =>
        (order[a.statusCategoryKey] ?? 3) - (order[b.statusCategoryKey] ?? 3) ||
        a.name.localeCompare(b.name),
    );
    return { ok: true, statuses };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// -----------------------------------------------------------------------------
// Per-project config
// -----------------------------------------------------------------------------

resolver.define('getConfig', async ({ context, payload }) => {
  await ensureMigrationV2();
  const projectKey = resolveProjectKey(context, payload);
  if (!projectKey) return { ok: false, error: 'No project selected.' };
  const raw = (await kvs.get(configKey(projectKey))) || null;
  const config = raw && typeof raw === 'object' ? raw : null;
  return {
    ok: true,
    projectKey,
    config,
    isCustom: !!config,
    isEnabled: config?.enabled === true,
    defaultTemplate: DEFAULT_TEMPLATE,
    placeholders: SUPPORTED_PLACEHOLDERS,
  };
});

resolver.define('saveConfig', async ({ context, payload }) => {
  await ensureMigrationV2();
  const projectKey = resolveProjectKey(context, payload);
  if (!projectKey) return { ok: false, error: 'No project selected.' };
  const enabled = payload?.enabled === true;
  // Enabling requires a trigger status; disabling can persist without one so
  // users don't lose the status/template they were mid-editing.
  if (enabled && !payload?.triggerStatusId) {
    return { ok: false, error: 'Pick a trigger status before enabling follow-ups.' };
  }
  const nextConfig = {
    enabled,
    triggerStatusId: payload?.triggerStatusId || null,
    triggerStatusName: payload?.triggerStatusName || null,
    template:
      typeof payload?.template === 'string' && payload.template.length > 0
        ? payload.template
        : DEFAULT_TEMPLATE,
    updatedAt: Date.now(),
  };
  await kvs.set(configKey(projectKey), nextConfig);
  await addToIndex(projectKey);
  return { ok: true, projectKey, config: nextConfig, isCustom: true, isEnabled: enabled };
});

resolver.define('resetConfig', async ({ context, payload }) => {
  await ensureMigrationV2();
  const projectKey = resolveProjectKey(context, payload);
  if (!projectKey) return { ok: false, error: 'No project selected.' };
  // Reset also clears the audit log for the space — consistent with "silence
  // means silence" when a space is not opted-in.
  await kvs.delete(configKey(projectKey));
  await kvs.delete(auditKey(projectKey));
  await removeFromIndex(projectKey);
  return {
    ok: true,
    projectKey,
    config: null,
    isCustom: false,
    isEnabled: false,
    defaultTemplate: DEFAULT_TEMPLATE,
  };
});

// -----------------------------------------------------------------------------
// Preview
// -----------------------------------------------------------------------------

resolver.define('previewTemplate', async ({ payload }) => {
  const template =
    typeof payload?.template === 'string'
      ? payload.template
      : DEFAULT_TEMPLATE;
  const vars = {
    issueKey: 'PROJ-42',
    actorDisplayName: 'Jamie Rivers',
    issueSummary: 'Ship the follow-up demo',
    ...(payload?.vars || {}),
  };
  return { ok: true, preview: renderTemplate(template, vars) };
});

// -----------------------------------------------------------------------------
// Audit — per project (project page) or combined (global page)
// -----------------------------------------------------------------------------

resolver.define('getProjectAudit', async ({ context, payload }) => {
  const projectKey = resolveProjectKey(context, payload);
  if (projectKey) {
    const entries = (await kvs.get(auditKey(projectKey))) || [];
    return { ok: true, projectKey, entries };
  }
  // Combined view (global page).
  const configured = (await kvs.get(CONFIG_INDEX_KEY)) || [];
  const all = [];
  for (const pk of configured) {
    const entries = (await kvs.get(auditKey(pk))) || [];
    for (const entry of entries) {
      all.push({ ...entry, projectKey: pk });
    }
  }
  all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { ok: true, projectKey: null, entries: all };
});

// -----------------------------------------------------------------------------
// Global summary — every project with a saved config, plus its audit tail.
// -----------------------------------------------------------------------------

resolver.define('getAllConfigs', async () => {
  await ensureMigrationV2();
  const projectKeys = (await kvs.get(CONFIG_INDEX_KEY)) || [];
  const rows = [];
  for (const pk of projectKeys) {
    const config = (await kvs.get(configKey(pk))) || null;
    const audit = (await kvs.get(auditKey(pk))) || [];
    rows.push({
      projectKey: pk,
      config,
      isEnabled: config?.enabled === true,
      lastFiredAt: audit[0]?.timestamp || null,
      lastFiredIssueKey: audit[0]?.issueKey || null,
      totalFollowUps: audit.length,
    });
  }
  rows.sort((a, b) => (b.lastFiredAt || 0) - (a.lastFiredAt || 0));
  return { ok: true, rows };
});

// -----------------------------------------------------------------------------
// Configured-projects index (tracks which project keys have saved configs)
// -----------------------------------------------------------------------------

async function addToIndex(projectKey) {
  const current = (await kvs.get(CONFIG_INDEX_KEY)) || [];
  if (!current.includes(projectKey)) {
    await kvs.set(CONFIG_INDEX_KEY, [...current, projectKey]);
  }
}
async function removeFromIndex(projectKey) {
  const current = (await kvs.get(CONFIG_INDEX_KEY)) || [];
  const next = current.filter((k) => k !== projectKey);
  await kvs.set(CONFIG_INDEX_KEY, next);
}

export const handler = resolver.getDefinitions();
