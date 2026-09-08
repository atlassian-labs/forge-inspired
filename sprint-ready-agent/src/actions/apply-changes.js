import api, { route } from '@forge/api';
import { baseUrlFromSelf, textToAdf } from '../jira.js';

// apply-changes — the write step. Description-only by design.
//
// This demo deliberately writes ONE field on the ticket: the description.
// See the "Make it yours" section of the README for how to extend it to
// AC custom fields, priority, labels, or anything else in the Jira REST
// issue payload.

export async function handleApplyChanges({ payload }) {
  const issueKey = String(payload?.issueKey ?? '').trim();
  if (!issueKey) {
    return { error: 'issueKey is required.' };
  }

  const newDescription = String(payload?.newDescription ?? '').trim();
  if (!newDescription) {
    return { error: 'newDescription is required and cannot be empty.' };
  }

  // Read `self` so we can return a canonical browse URL for the ticket.
  // We don't need the previous description — the agent is instructed not
  // to re-print a diff in chat, so we don't bother sending one back.
  const currentRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);

  if (!currentRes.ok) {
    const body = await currentRes.text().catch(() => '');
    return {
      error: `Could not read ${issueKey} before apply: ${currentRes.status} ${body.slice(0, 200)}`,
    };
  }
  const current = await currentRes.json();
  const baseUrl = baseUrlFromSelf(current.self);

  // Single PUT — description as ADF.
  const updateRes = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        fields: { description: textToAdf(newDescription) },
      }),
    },
  );

  if (!updateRes.ok) {
    const body = await updateRes.text().catch(() => '');
    return {
      error: `Failed to update ${issueKey}: ${updateRes.status} ${body.slice(0, 200)}`,
    };
  }

  // Return the minimum the agent needs to write a warm confirmation
  // message. No diff — the description is already visible on the ticket.
  return {
    ok: true,
    issueKey,
    issueUrl: baseUrl ? `${baseUrl}/browse/${issueKey}` : `/browse/${issueKey}`,
    message: `Description of ${issueKey} has been updated.`,
  };
}
