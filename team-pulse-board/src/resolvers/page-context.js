import api, { route } from '@forge/api';

// Team Pulse Board — page-context resolver.
//
// This resolver is anchored on the *page*, not on "who edited the page":
// it runs the JQL search you'd write yourself to find Jira tickets that are
// really about this Confluence page.
//
// Two match signals, unioned:
//   1. URL match          — description or comment contains the page URL
//   2. Title-token match  — summary or description contains distinctive
//                            proper-noun-ish tokens extracted from the page
//                            title (e.g. product name, project codename)
//
// Frontend can also send extra tokens via `payload.extraTokens` — this is
// how the "Add word" UI widens the search live without touching the code.

const MAX_RELATED_TICKETS = 30;
const MAX_CONTRIBUTORS = 30;
const VERSIONS_PAGE_LIMIT = 50;

// -----------------------------------------------------------------------------
// Confluence helpers
// -----------------------------------------------------------------------------

async function getPage(pageId) {
  const res = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Confluence page ${pageId} → ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function getPageVersionAuthors(pageId) {
  try {
    const res = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/pages/${pageId}/versions?limit=${VERSIONS_PAGE_LIMIT}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).map((v) => v.authorId).filter(Boolean);
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// Title-token extraction
// -----------------------------------------------------------------------------
// We pull "distinctive" tokens out of the page title — the words a human
// would recognise as being *about* the topic (Aurora, Nimbus, MyProject).
// Stopwords + short/common words are filtered out. We prefer proper-noun-ish
// tokens (capitalised) but also accept ALL-CAPS acronyms and identifiers
// with internal capitals or digits.

const TITLE_STOPWORDS = new Set([
  // Generic
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'he', 'her', 'him', 'his', 'if', 'in', 'is', 'it', 'its', 'not', 'of',
  'on', 'or', 'she', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'who', 'why', 'will', 'with', 'you', 'your', 'our', 'us', 'been', 'being',
  'into', 'over', 'under', 'out', 'up', 'down', 'off', 'via', 'vs', 'v',
  // Doc/meeting/planning noise
  'plan', 'plans', 'planning', 'doc', 'docs', 'document', 'notes', 'page',
  'pages', 'wiki', 'draft', 'drafts', 'ideas', 'idea', 'update', 'updates',
  'sync', 'review', 'reviews', 'meeting', 'meetings', 'overview', 'summary',
  'launch', 'launches', 'project', 'projects',
  // Time boxes
  'q1', 'q2', 'q3', 'q4', 'h1', 'h2', 'fy', 'fy25', 'fy26',
  '2024', '2025', '2026',
]);

function extractTitleTokens(title) {
  if (!title) return [];
  const rawTokens = String(title)
    .split(/[^\p{L}\p{N}\-]+/u)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter(Boolean);

  const kept = [];
  const seen = new Set();
  for (const tok of rawTokens) {
    if (tok.length < 3) continue;
    const lower = tok.toLowerCase();
    if (TITLE_STOPWORDS.has(lower)) continue;
    // Distinctive = starts with uppercase, or is all caps, or has an
    // internal capital / digit (e.g. "iOS", "K8s", "OAuth2").
    const looksDistinctive =
      /^[A-Z]/.test(tok) ||
      tok === tok.toUpperCase() ||
      /[A-Z]/.test(tok.slice(1)) ||
      /\d/.test(tok);
    if (!looksDistinctive) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    kept.push(tok);
  }
  return kept.slice(0, 6); // keep the JQL bounded
}

// -----------------------------------------------------------------------------
// Jira helpers
// -----------------------------------------------------------------------------

// The tenant Jira base URL — /rest/api/3/serverInfo returns this reliably,
// unlike `issue.self` which goes through the api.atlassian.com proxy.
async function getJiraBaseUrl() {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
    if (!res.ok) return '';
    const info = await res.json();
    return (info.baseUrl ?? '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function escapeForJql(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildJql(pageWebUrl, tokens) {
  const clauses = [];
  if (pageWebUrl) {
    const escapedUrl = escapeForJql(pageWebUrl);
    clauses.push(`description ~ "${escapedUrl}"`);
    clauses.push(`comment ~ "${escapedUrl}"`);
  }
  for (const tok of tokens) {
    const escaped = escapeForJql(tok);
    clauses.push(`summary ~ "${escaped}"`);
    clauses.push(`description ~ "${escaped}"`);
  }
  if (clauses.length === 0) return null;
  return `(${clauses.join(' OR ')}) ORDER BY updated DESC`;
}

async function searchRelatedTickets(pageWebUrl, tokens, jiraBaseUrl) {
  const jql = buildJql(pageWebUrl, tokens);
  if (!jql) return { jql: null, tickets: [] };

  const body = JSON.stringify({
    jql,
    fields: ['summary', 'status', 'assignee', 'updated'],
    maxResults: MAX_RELATED_TICKETS,
  });

  // Prefer the enhanced-search endpoint; fall back to the classic one on
  // instances where /search/jql isn't available.
  let res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    res = await api.asUser().requestJira(route`/rest/api/3/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.warn(
      `[team-pulse-board] Jira search failed: ${res.status} ${errBody.slice(0, 200)}`,
    );
    return { jql, tickets: [] };
  }

  const json = await res.json();
  const tickets = (json.issues ?? []).map((issue) => ({
    key: issue.key,
    url: jiraBaseUrl ? `${jiraBaseUrl}/browse/${issue.key}` : `/browse/${issue.key}`,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? 'Unknown',
    statusCategory: issue.fields?.status?.statusCategory?.key ?? 'new',
    assigneeId: issue.fields?.assignee?.accountId ?? null,
    updated: issue.fields?.updated ?? null,
  }));

  return { jql, tickets };
}

async function hydrateUser(accountId) {
  try {
    const res = await api
      .asUser()
      .requestJira(route`/rest/api/3/user?accountId=${accountId}`);
    if (!res.ok) return null;
    const u = await res.json();
    return {
      accountId,
      displayName: u.displayName ?? 'Unknown user',
      avatarUrl: u.avatarUrls?.['48x48'] ?? null,
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Payload helpers
// -----------------------------------------------------------------------------

// v2 pages spells the page author differently across responses — try them all.
function resolvePageAuthorId(page) {
  return (
    page?.authorId ??
    page?.ownerId ??
    page?.createdBy?.accountId ??
    page?.version?.authorId ??
    null
  );
}

// Build the page's canonical URL from the v2 response.
function resolvePageWebUrl(page) {
  const webPath = page?._links?.webui ?? '';
  const base = page?._links?.base ?? '';
  if (!webPath) return '';
  if (base && !webPath.startsWith('http')) return `${base}${webPath}`;
  return webPath;
}

// Dedupe tokens (case-insensitive), preserving first-seen ordering.
function mergeTokens(auto, extras) {
  const seen = new Set();
  const out = [];
  for (const t of [...(auto ?? []), ...(extras ?? [])]) {
    const key = String(t).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function normaliseExtraTokens(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t ?? '').trim())
    .filter((t) => t.length > 0);
}

// -----------------------------------------------------------------------------
// Resolver registration
// -----------------------------------------------------------------------------

export function registerPageContextResolvers(resolver) {
  resolver.define('getPageContext', async ({ context, payload }) => {
    const rawPageId =
      payload?.pageId ??
      context?.extension?.content?.id ??
      context?.contentId ??
      null;

    const pageId = rawPageId
      ? String(rawPageId).split('/').pop().split(':').pop()
      : null;

    if (!pageId) {
      return {
        error:
          'No Confluence page context. Insert this macro on a published page to see related work.',
      };
    }

    let page;
    try {
      page = await getPage(pageId);
    } catch (err) {
      return { error: String(err.message ?? err) };
    }

    const pageWebUrl = resolvePageWebUrl(page);
    const autoTokens = extractTitleTokens(page.title);
    const extraTokens = normaliseExtraTokens(payload?.extraTokens);
    const tokens = mergeTokens(autoTokens, extraTokens);

    // Resolve the tenant Jira URL so ticket links point at the customer's
    // site, not the api.atlassian.com proxy.
    const jiraBaseUrl = await getJiraBaseUrl();

    const [versionAuthors, ticketResult] = await Promise.all([
      getPageVersionAuthors(pageId),
      searchRelatedTickets(pageWebUrl, tokens, jiraBaseUrl),
    ]);

    // Contributor roster is used internally to hydrate names for the ticket
    // filter (search by assignee name). Not rendered as its own panel.
    const contributorSeen = new Set();
    const contributorIds = [];
    const addContributor = (id) => {
      if (!id || contributorSeen.has(id)) return;
      contributorSeen.add(id);
      if (contributorIds.length < MAX_CONTRIBUTORS) contributorIds.push(id);
    };
    addContributor(resolvePageAuthorId(page));
    versionAuthors.forEach(addContributor);
    ticketResult.tickets.forEach((t) => addContributor(t.assigneeId));

    const contributors = (
      await Promise.all(contributorIds.map(hydrateUser))
    ).filter(Boolean);

    return {
      pageId,
      pageTitle: page.title ?? null,
      pageWebUrl,
      autoTokens,
      extraTokens,
      tokens,
      jql: ticketResult.jql,
      relatedTickets: ticketResult.tickets,
      contributors,
      totals: {
        relatedTickets: ticketResult.tickets.length,
        contributors: contributors.length,
      },
      error: null,
    };
  });
}
