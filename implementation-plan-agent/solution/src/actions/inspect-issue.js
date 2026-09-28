import api, { route } from '@forge/api';
import { baseUrlFromSelf, adfToText } from '../jira.js';

// inspect-issue — read-only.
//
// Returns the minimum the agent needs to draft an implementation plan:
// summary, description (flattened to plain text), issue type, status,
// priority, assignee, reporter, and labels.
//
// We deliberately DO NOT read custom fields — the workshop version keeps
// the surface small so participants can trace every field end to end.

export async function handleInspectIssue({ payload }) {
  const issueKey = String(payload?.issueKey ?? '').trim();
  if (!issueKey) {
    return { error: 'issueKey is required.' };
  }

  // Ask Jira for exactly the fields we plan to use. Being explicit keeps
  // the response payload small and predictable.
  const fieldList = [
    'summary',
    'description',
    'issuetype',
    'status',
    'priority',
    'assignee',
    'reporter',
    'labels',
  ].join(',');

  let issueRes;
  try {
    // asUser() runs the request with the invoking user's Jira permissions,
    // so the agent can only see issues the user themselves can see.
    issueRes = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=${fieldList}`);
  } catch (err) {
    return { error: `Failed to fetch ${issueKey}: ${String(err.message ?? err)}` };
  }

  if (!issueRes.ok) {
    const body = await issueRes.text().catch(() => '');
    return {
      error: `Jira returned ${issueRes.status} for ${issueKey}: ${body.slice(0, 200)}`,
    };
  }

  const issue = await issueRes.json();
  const f = issue.fields ?? {};
  const baseUrl = baseUrlFromSelf(issue.self);

  // Return a lean, agent-friendly shape. Strings and nulls only where we
  // can help it — no nested objects the model has to unpack.
  return {
    issueKey: issue.key,
    issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : `/browse/${issue.key}`,
    summary: f.summary ?? null,
    issueType: f.issuetype?.name ?? null,
    status: f.status?.name ?? null,
    priority: f.priority?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    labels: Array.isArray(f.labels) ? f.labels : [],
    description: adfToText(f.description) || null,
  };
}
