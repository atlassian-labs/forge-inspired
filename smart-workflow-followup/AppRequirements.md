# Smart Workflow Follow-up — App Requirements

Part of the [**Forge Inspired**](../README.md) collection. This document is the source of truth for what the app is, what it does, and what it deliberately doesn't do. If code and this doc disagree, this doc is wrong — file a PR.

---

## Problem

Every scrum team ends up posting the same follow-up comment over and over: *"nice one, remember to close linked work,"* *"please add release notes,"* *"blocked? drop a note in #eng-help."* It's the kind of chore that either doesn't get done consistently, or eats real time when it does.

## Solution

A single global page in the Jira top nav where a Jira admin can, **per project**:

- Turn follow-ups **on** for that project.
- Pick the **status** that should trigger a comment.
- Write the **comment template** — a small piece of text with variable tokens (`{{issueKey}}`, `{{actorDisplayName}}`, `{{issueSummary}}`) that get filled in per issue.

A Forge `trigger` listens for `avi:jira:updated:issue` and — for projects that are explicitly enabled — posts the rendered comment on every issue that transitions into the configured status. The same page shows every enabled project and a combined audit feed of every follow-up posted.

## Non-goals

- **No auto-enable.** The app is off in every project by default. There's no "turn on for all projects" shortcut. Explicit opt-in is a safety feature, not a bug.
- **No multi-trigger per project.** One status → one comment per project. If a team wants two follow-ups, they use two apps or extend this one.
- **No conditional comments.** The template is the same for every issue that hits the trigger — no branching, no if/then in the template DSL.
- **No output channels other than a Jira comment.** No Slack, no email, no webhook — Jira-only, on purpose.
- **No auto-close, no field writes, no state changes.** The write scope only posts comments.
- **No LLM in the loop.** The template renders deterministically. If a team wants AI-drafted comments, that's a different app.

---

## User flow

### A) First-time setup (per project)

1. Admin opens **Apps → Smart Workflow Follow-up** in the Jira top nav.
2. Picks a project from the dropdown.
3. Flips **Enable follow-ups for this project** on.
4. Picks the trigger status from the workflow.
5. Writes/edits the comment template. Clicks **+ Issue key** / **+ Person's name** / **+ Issue summary** buttons to insert variables. A live preview shows exactly what will be posted.
6. Clicks **Save & enable**.
7. Confirmation banner appears. The project now shows up in the "enabled projects" list below.

### B) Steady state

1. A team member moves an issue in the enabled project to the configured trigger status.
2. Within a few seconds, the app posts the rendered follow-up comment on the issue.
3. An audit row is written: `{ issueKey, actor, timestamp, outcome, commentId }`.
4. The audit feed on the app's page updates on next open.

### C) Disable

Two levels of "off":

- **Per-project:** flip the enable toggle off, or click **Remove configuration** to also delete audit history. Either way, no further comments are posted for that project.
- **All-projects:** uninstall the app.

---

## Functional requirements

### Modules

- **`jira:globalPage`** (`smart-workflow-followup-page`) — the app's one and only page.
  - Resource: `src/frontend/globalPage.jsx` (UI Kit / native render).
  - Resolver: `index.handler` (backed by `src/resolvers/index.js`).
- **`trigger`** (`onIssueUpdated`) — the reactive core.
  - Event: `avi:jira:updated:issue`.
  - Handler: `src/trigger.js`'s `onIssueUpdated` export.
- **`function`** × 2:
  - `resolver-fn` → `index.handler` (backs the global page).
  - `trigger-fn` → `index.onIssueUpdated` (backs the trigger).

### Scopes

- `read:jira-work` — read issue fields (summary, key, changelog).
- `read:jira-user` — resolve the actor's display name for `{{actorDisplayName}}`.
- `read:project:jira` — list projects for the picker and read project workflow statuses.
- `write:jira-work` — post the follow-up comment. Only ever writes comments; never touches issue fields, statuses, or workflow.
- `storage:app` — persist per-project config and audit rows.

### Behavior — the global page

1. On open, resolver returns the list of enabled projects + their configs + a combined audit feed (last N rows across all projects).
2. Page renders:
   - **Configuration section**: project picker, enable toggle, status picker, template editor with insert buttons, live preview, Save/Remove buttons.
   - **Enabled projects list**: one row per configured project (name, trigger status, template summary, edit link).
   - **Audit feed**: chronological list of every follow-up posted (issue key, timestamp, outcome, error if any).
3. All writes go through the resolver, which validates + persists to KVS.

### Behavior — the trigger

Governed by `src/trigger.js`'s `onIssueUpdated` handler.

1. Extract `issueKey`, `projectKey`, `issueSummary` from the event; extract the status transition from the changelog.
2. **Skip immediately** if:
   - No status change in this update, OR
   - No config exists for the project, OR
   - `config.enabled !== true`, OR
   - `statusChange.to !== config.triggerStatusId`.
3. **Dedupe** — every event is keyed by `${issueKey}:${eventId}`. Second delivery of the same event is a silent no-op.
4. Render the template (`src/templates.js` `renderTemplate()`), fill in the variables, post via `POST /rest/api/3/issue/{key}/comment`.
5. Write an audit row: `{ issueKey, actor, timestamp, outcome: "posted" | "error" | "skipped-duplicate", commentId, error? }`.
6. Prune the project's audit log to the last `AUDIT_MAX_ENTRIES` (currently 100) — keeps KVS small.

### Template / variables

- Templates live in `src/templates.js`:
  - `DEFAULT_TEMPLATE` — the string a project sees on first configuration.
  - `SUPPORTED_PLACEHOLDERS` — the list of `{ key, help }` variables the UI exposes as insert buttons.
  - `renderTemplate(template, vars)` — pure function; unknown placeholders and missing values become empty string (prefer a clean comment over noisy `{{unresolved}}` text in a customer issue).
- Adding a variable = add to `SUPPORTED_PLACEHOLDERS` + populate the matching key in `trigger.js` where `renderTemplate` is called.

### Opt-in migration (`MIGRATION_V2_KEY`)

Because the app originally auto-fired on any "Done" transition, an install-scoped one-shot migration wipes every pre-existing per-project config + audit row so no project silently keeps firing after upgrade. The migration runs on the first resolver call after upgrade; a set KVS flag short-circuits it on cold starts thereafter.

---

## Data / storage

Backed by `@forge/kvs`:

- `config:<PROJECT-KEY>` — `{ enabled, triggerStatusId, template, updatedAt }`.
- `audit:<PROJECT-KEY>` — array of the last 100 audit rows for that project.
- `configuredProjects` — a small index array of project keys that have a config (used by the page to render the enabled-projects list without scanning every possible key).
- `migration:v2:optInDone` — one-shot boolean flag; presence means the auto→opt-in wipe has already run.
- **Dedupe keys** — `event:<ISSUE-KEY>:<EVENT-ID>` written before the comment is posted; a set key on a subsequent call short-circuits with `outcome: "skipped-duplicate"`.

## Prerequisites

- Forge CLI, logged in.
- Node.js 22+.
- A Jira Cloud site the installer can admin.

## Related apps in the collection

