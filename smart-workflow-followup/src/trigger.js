import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { buildComment, DEFAULT_TEMPLATE } from './templates';

/** Cap the per-project audit log so Storage stays small. */
const AUDIT_MAX_ENTRIES = 100;

const configKey = (projectKey) => `config:${projectKey}`;
const auditKey = (projectKey) => `audit:${projectKey}`;

/**
 * Handler for the `avi:jira:updated:issue` trigger.
 *
 * Routing (opt-in model — see Proposal 1):
 *   - The app is OFF for every project by default.
 *   - It fires only when a project has an explicit, saved config with
 *     `enabled === true` AND a chosen `triggerStatusId`.
 *   - When a project is disabled (or has no config), we do NOT write to the
 *     audit log for that project — silence means silence.
 */
export const onIssueUpdated = async (event, context) => {
  const eventId = context?.eventId || context?.invocationId || `${Date.now()}`;
  const issue = event?.issue;
  const changelog = event?.changelog;
  const projectKey = issue?.fields?.project?.key || issue?.key?.split('-')?.[0];
  const issueKey = issue?.key;
  const issueSummary = issue?.fields?.summary || '';
  if (!issueKey || !projectKey) return;

  // Was there a status change on this update?
  const statusChange = getStatusChange(changelog);
  if (!statusChange) return;

  // Opt-in routing: require enabled + a chosen trigger status. No fallback,
  // no audit for disabled/unconfigured projects.
  const config = (await kvs.get(configKey(projectKey))) || null;
  if (!config || config.enabled !== true || !config.triggerStatusId) return;
  if (statusChange.to !== String(config.triggerStatusId)) return;

  // Dedupe repeated deliveries of the same event.
  const dedupeKey = `dedupe:${issueKey}:${eventId}`;
  const already = await kvs.get(dedupeKey);
  if (already) {
    await appendAudit(projectKey, {
      issueKey,
      issueSummary,
      timestamp: Date.now(),
      outcome: 'skipped-duplicate',
      triggerStatusName: config?.triggerStatusName || 'Done',
    });
    return;
  }
  await kvs.set(dedupeKey, true);

  // Resolve the actor's display name — the event only gives us the AAID.
  const actorAccountId =
    event?.atlassianId ||
    event?.user?.accountId ||
    event?.user?.atlassianAccountId ||
    null;
  const actorDisplayName = actorAccountId
    ? await resolveDisplayName(actorAccountId)
    : (event?.user?.displayName || 'someone');

  // Which template? Per-project override or shipped default.
  const template =
    typeof config?.template === 'string' && config.template.length > 0
      ? config.template
      : DEFAULT_TEMPLATE;

  const vars = { issueKey, actorDisplayName, issueSummary };
  const body = buildComment({ template, vars });

  const res = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ body }),
    });

  if (!res.ok) {
    await appendAudit(projectKey, {
      issueKey,
      issueSummary,
      timestamp: Date.now(),
      outcome: 'error',
      error: `${res.status} ${await res.text()}`,
      triggerStatusName: config?.triggerStatusName || 'Done',
    });
    return;
  }

  await appendAudit(projectKey, {
    issueKey,
    issueSummary,
    actorDisplayName,
    timestamp: Date.now(),
    outcome: 'commented',
    triggerStatusName: config?.triggerStatusName || 'Done',
  });
};

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function getStatusChange(changelog) {
  const items = Array.isArray(changelog?.items) ? changelog.items : [];
  const statusItem = items.find(
    (i) => (i?.field || '').toLowerCase() === 'status' && (i?.fieldtype || 'jira') === 'jira',
  );
  if (!statusItem) return null;
  return { from: statusItem.from, to: statusItem.to };
}

async function resolveDisplayName(accountId) {
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`);
    if (!res.ok) return 'someone';
    const json = await res.json();
    return json?.displayName || 'someone';
  } catch {
    return 'someone';
  }
}

async function appendAudit(projectKey, entry) {
  const key = auditKey(projectKey);
  const existing = (await kvs.get(key)) || [];
  const next = [entry, ...existing].slice(0, AUDIT_MAX_ENTRIES);
  await kvs.set(key, next);
}
