import api, { route } from '@forge/api';
import { baseUrlFromSelf, textToAdf } from '../jira.js';

// post-implementation-plan — the write step.
//
// Posts the agent's drafted implementation plan back to the Jira issue as
// ONE comment. By design this action does nothing else: it does not edit
// the description, it does not change fields, it does not create sub-tasks.
// Keeping the write path narrow is a good pattern for AI agents — it makes
// the blast radius easy to reason about.

export async function handlePostImplementationPlan({ payload }) {
  const issueKey = String(payload?.issueKey ?? '').trim();
  if (!issueKey) {
    return { error: 'issueKey is required.' };
  }

  const planMarkdown = String(payload?.planMarkdown ?? '').trim();
  if (!planMarkdown) {
    return { error: 'planMarkdown is required and cannot be empty.' };
  }

  // Read `self` first so we can build a canonical browse URL to return.
  // This also fails fast (with a permission-aware error) if the user
  // can't see the issue in the first place.
  const currentRes = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);

  if (!currentRes.ok) {
    const body = await currentRes.text().catch(() => '');
    return {
      error: `Could not read ${issueKey} before commenting: ${currentRes.status} ${body.slice(0, 200)}`,
    };
  }
  const current = await currentRes.json();
  const baseUrl = baseUrlFromSelf(current.self);

  // Prefix the plan with a small marker so it's obvious in the ticket
  // history which comments came from the agent. The agent's own text
  // follows underneath, verbatim.
  const commentBody = [
    'Implementation plan drafted by the Implementation Plan Agent (Rovo).',
    '',
    planMarkdown,
  ].join('\n');

  // Single POST — one action, one comment.
  const postRes = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ body: textToAdf(commentBody) }),
    },
  );

  if (!postRes.ok) {
    const body = await postRes.text().catch(() => '');
    return {
      error: `Failed to post comment to ${issueKey}: ${postRes.status} ${body.slice(0, 200)}`,
    };
  }

  const created = await postRes.json().catch(() => ({}));
  const commentId = created?.id ?? null;

  // Return the minimum the agent needs to write a warm confirmation
  // message back to the user in chat.
  const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : `/browse/${issueKey}`;
  return {
    ok: true,
    issueKey,
    commentId,
    issueUrl,
    // Deep-link to the specific comment so the user can jump straight to it.
    commentUrl: commentId ? `${issueUrl}?focusedCommentId=${commentId}` : issueUrl,
    message: `Implementation plan posted as a comment on ${issueKey}.`,
  };
}
