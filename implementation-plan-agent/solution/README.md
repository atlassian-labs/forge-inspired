# Solution — Implementation Plan Agent

> The finished version of the [Implementation Plan Agent workshop](../README.md). If you want to see what "good" looks like, deploy this. If you're building the [`baseline/`](../baseline) into the finished agent, use this as your reference.

## What this agent does

A Rovo agent that:

1. Reads a Jira issue's context via the `inspect-issue` action — summary, description (ADF flattened to plain text), issue type, status, priority, assignee, reporter, and labels. **No custom fields**, by design.
2. Drafts an implementation plan with four sections: **Context**, **Proposed approach**, **Implementation steps**, **Risks & open questions**. Rovo's built-in access to your organization's knowledge is used to ground the plan.
3. Posts the plan back to the same issue as a single Jira comment via the `post-implementation-plan` action.
4. Replies in chat with a deep link to the new comment.

## Run it

```bash
cd implementation-plan-agent/solution
npm install
forge register        # First time only — writes YOUR app id into manifest.yml
forge deploy
forge install         # Pick your Jira Cloud site
```

Then on any Jira issue:

1. Open the issue's **Agents** panel (or open Rovo Chat).
2. Choose **Implementation Plan Agent**.
3. Say something like `Plan PROJ-123 for me`.
4. Watch the agent read the issue and post the plan back as one comment.

## The interesting files

- **[`manifest.yml`](./manifest.yml)** — the agent prompt, two `action`s, and the three Jira scopes it needs.
- **[`src/actions/inspect-issue.js`](./src/actions/inspect-issue.js)** — the read path. One `GET` to `/rest/api/3/issue/{key}` with an explicit field list, then a lean JSON return.
- **[`src/actions/post-implementation-plan.js`](./src/actions/post-implementation-plan.js)** — the sole write path. One `POST` to `/rest/api/3/issue/{key}/comment`. Adds a small "drafted by the Implementation Plan Agent" marker line so agent-authored comments are easy to spot in ticket history.
- **[`src/jira.js`](./src/jira.js)** — three tiny helpers: `baseUrlFromSelf` (canonical browse URLs), `adfToText` (flatten description ADF), `textToAdf` (wrap the plan for the comment POST).
- **[`src/index.js`](./src/index.js)** — the Forge function entry points; just wires exports to handler modules.

## Scopes and safety

- `read:jira-work`, `read:jira-user`, `write:jira-work`.
- Every Jira call uses `asUser()`, so the agent's effective permissions are bounded by the invoking user's Jira permissions.
- The write path is deliberately narrow: it only posts comments. It cannot edit the description, transition the issue, or change any field.

## Extending it

- **Include custom fields in the read** — add the field IDs to `fieldList` in `inspect-issue.js` and surface them in the return object.
- **Format the comment as richer ADF** — replace `textToAdf` with a Markdown-to-ADF converter for headings, lists, and code blocks.
- **Add a "propose then confirm" flow** — take a leaf out of [`sprint-ready-agent`](../../sprint-ready-agent) and require the user to type `apply` before the comment is posted.

After any manifest change, redeploy (`forge deploy`) and, if you changed scopes, run `forge install --upgrade`.
