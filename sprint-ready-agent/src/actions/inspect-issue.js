import api, { route } from '@forge/api';
import { baseUrlFromSelf, adfToText } from '../jira.js';

// inspect-issue — read-only. Returns the minimum the agent needs to
// reason about whether the issue's description is sprint-ready.
//
// Deliberately narrow: this demo only touches the description field, so
// we don't fetch or return priority / labels / AC custom fields / links /
// comments. If you extend the agent to touch more fields, expand the
// fetched field list and the returned shape here.

export async function handleInspectIssue({ payload }) {
  const issueKey = String(payload?.issueKey ?? '').trim();
  if (!issueKey) {
    return { error: 'issueKey is required.' };
  }

  const fieldList = ['summary', 'description', 'issuetype'].join(',');

  let issueRes;
  try {
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

  return {
    issueKey: issue.key,
    issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : `/browse/${issue.key}`,
    summary: f.summary ?? null,
    issueType: f.issuetype?.name ?? null,
    description: adfToText(f.description) || null,
  };
}
