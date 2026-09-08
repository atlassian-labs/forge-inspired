# Sprint Ready Agent — App Requirements

## Problem

Sprint planning meetings burn time on the same problem: tickets show up half-written. Someone dropped an idea into Jira on a Friday, and now the room is trying to guess what "done" looks like, what the ticket even asks for, and whether it can be picked up cold. That "let me re-read this and figure out what's missing" cycle costs every planning meeting 10–15 minutes it doesn't need to spend.

## Solution

A single Rovo agent — **Sprint Ready Agent** — that reads a Jira ticket in-context, rewrites its **description** into a canonical, sprint-ready shape, and only writes to the ticket once a human types `apply`. The rewrite always follows the same template so descriptions across the backlog become skimmable and predictable.

## Principles

- **Read freely, write on approval.** The agent's read path is unrestricted. Its write path only fires after the user explicitly confirms.
- **One field, one job.** By design, this agent only ever writes the `description` field. This keeps the demo tight and makes the "extend it yourself" story easy to follow (see the README's *Make it yours* section).
- **Structure over prose.** The output shape is a canonical Markdown template stored in the repo. Teams change the template file to change what every generated ticket looks like — no prompt hacking required.
- **Ground truth, not guesses.** If the ticket doesn't tell the agent something, it either leaves that section as `_None._` or moves it to `## Open questions`. It never fabricates facts.
- **One agent, two doors.** The same `rovo:agent` module surfaces in both Rovo Chat *and* the Agents panel on every Jira ticket — one manifest, one prompt, two entry points.

## User Flow

1. Open any Jira ticket that's a bit sparse.
2. In the ticket's **Agents** panel, find **Sprint Ready Agent** and click **Start work → Prepare an issue for sprint planning**.
3. The agent calls `inspect-issue` to read the ticket in-context (summary, issue type, current description).
4. It replies in chat with a proposed full-description rewrite, every section from the canonical template, populated from what it could learn. Anything it couldn't infer goes to `## Open questions`. Format includes:
   - **Verdict** — "needs rewrite" or "already sprint-ready", one-line reason.
   - **Current description** — one- or two-line summary of what's there today.
   - **Proposed description** — the full rewrite in a fenced block.
   - **Why this rewrite** — one line grounded in the inspected ticket.
   - **Confidence** — high / medium / low.
5. User replies `apply` (or `cancel`).
6. On `apply`, the agent calls `apply-changes` with the approved text and replies with a short warm confirmation + a link to the ticket. No before/after diff — the user can see the new description on the ticket itself.
7. User can iterate ("make the AC more specific," "add a rollout section") and the agent re-drafts. Or the user edits the ticket directly; the agent picks up their edits next time.

## Modules & Manifest

- **`rovo:agent`** (key `sprint-ready-agent`)
  - Available in Rovo Chat and as an assignable agent on every Jira ticket.
  - Conversation starter: "Prepare an issue for sprint planning".
  - Wired to two actions: `inspect-issue` and `apply-changes`.
- **`action`** × 2:
  - `inspect-issue` — `actionVerb: GET`. Read-only. Inputs: `issueKey`. Returns `summary`, `issueType`, `description`.
  - `apply-changes` — `actionVerb: TRIGGER`. Write path. Inputs: `issueKey`, `newDescription`. PUTs the ADF-converted description in one call.
- **`function`** × 2 — backend handlers for the two actions.

## Scopes

- `read:jira-work` — the `inspect-issue` action.
- `read:jira-user` — resolves account IDs surfaced in the ticket context (kept for future extensions; not strictly required today).
- `write:jira-work` — the only write path, only ever used by `apply-changes` to update the description.

## The canonical template

Defined in [`src/templates/ticket-template.md`](./src/templates/ticket-template.md). Every generated description matches this shape exactly:

- `## Context` — WHY this work exists.
- `## Objective` — one-line user story in "As a X, I want Y, so that Z" form.
- `## Scope — what needs to change` — WHAT changes, in concrete terms.
- `## Acceptance criteria` — numbered, testable, HOW-do-we-know.
- `## Out of scope` — what this ticket does *not* cover.
- `## Reproducible steps` — bug-only; otherwise `_None._`.
- `## Open questions` — anything the agent couldn't infer.
- `## Links & dependencies` — related tickets, PRs, design docs.

Teams change this file to change the shape of every generated ticket. The prompt in `manifest.yml` handles reasoning; the template file handles structure.

## Action contracts

**`inspect-issue`**
- **Input:** `{ issueKey: string }`
- **Output:**
  ```
  {
    issueKey: string,
    summary: string,
    issueType: string | null,
    description: string | null   // markdown-ish plain text
  }
  ```

**`apply-changes`**
- **Input:** `{ issueKey: string, newDescription: string }`
- **Output:**
  ```
  {
    ok: true,
    issueKey: string,
    issueUrl: string,
    message: string
  }
  ```
- Fails cleanly if `newDescription` is empty or the issue can't be read/updated. Returns `{ error: "..." }` in the failure case so the agent can surface the message.

## Prompt

Lives inline in `manifest.yml` (the `rovo:agent.prompt:` block). Covers:

- Role and safety posture.
- The three Sprint-Ready questions (WHY / WHAT / HOW).
- The workflow (resolve issue key → inspect → score → draft → confirm → apply → warm ack).
- The description quality bar (canonical template, BAD/GOOD example).
- The chat format template for the proposal.
- The chat format template for the post-apply confirmation.

## Non-goals

- Not a full Rovo tutorial. See the [Rovo docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/).
- No custom fields, no priority/label/status writes. The demo intentionally stays description-only. The README's *Make it yours* section shows how to extend.
- No writes without explicit confirmation.
- No caching or scoring database — every proposal is fresh from the current ticket state.

## Extension points

- **Change the shape of the generated description** — edit `src/templates/ticket-template.md`.
- **Change what "sprint-ready" means** — edit the `prompt:` block in `manifest.yml`.
- **Let the agent write more fields** — add an input to `apply-changes` in the manifest, handle it in `src/actions/apply-changes.js`, teach the agent about it in the prompt, and loosen the "refuse anything but description" safety guardrail.

## Repo layout

```
sprint-ready-agent/
├── AppRequirements.md              ← this file
├── README.md                       ← user-facing pitch + "Make it yours"
├── manifest.yml                    ← modules, scopes, and the agent prompt
├── package.json / package-lock.json
├── .gitignore
└── src/
    ├── index.js                    ← resolver wiring for the two actions
    ├── jira.js                     ← REST + ADF helpers
    ├── templates/
    │   └── ticket-template.md      ← the canonical shape
    └── actions/
        ├── inspect-issue.js        ← read-only
        └── apply-changes.js        ← guarded write
```
