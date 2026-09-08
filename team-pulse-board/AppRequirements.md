# Team Pulse Board — App Requirements

Part of the [**Forge Inspired**](../README.md) collection. This document is the source of truth for what the app is, what it does, and what it deliberately doesn't do. If code and this doc disagree, this doc is wrong — file a PR.

---

## Problem

Every team has a handful of Confluence pages that quietly become the anchor for real work — a launch brief, a design doc, an RFC — with a dozen Jira tickets moving around them. But most of those tickets don't link back to the page. Someone writes a launch brief called *"Aurora"*; engineers open *"Aurora backend spike"* and *"Aurora UI polish"* tickets and never paste the page URL. The connection is obvious to a human and invisible to Jira.

The result: from the Confluence page, you can't see the work. From the ticket, you can't see the anchor doc. Everyone knows they're related; nobody has typed the link.

## Solution

A single Confluence macro — **Team Pulse Board** — that authors insert on any page with `/`. The macro **runs the JQL you'd write yourself**, live on the page: distinctive words from the page title become search terms, any ticket whose summary or description matches shows up, and (as a supplement) any ticket that *does* explicitly link the page URL is picked up too. Tickets are grouped by status (To Do / In Progress / Done) in collapsible sections.

The list of match words is **editable in the UI**. The macro proposes an initial set of tokens from the page title; the user can add more (`+ Add word`) or remove any user-added token (`✕`), and the search re-runs live.

Zero configuration. No admin page. No storage. Everything is derived from the current page context plus one JQL search per load.

## Non-goals

- **No admin page, no settings.** The macro derives everything from the page it's on.
- **No storage.** Nothing is persisted between renders. Extra match words are session-only.
- **No auto-polling.** Refresh is manual.
- **No writes.** Read-only across both products.
- **No cross-page rollup.** Each macro renders for the page it's on.
- **No pagination.** Capped at 30 tickets to keep the load bounded for a demo.

---

## User flow

1. Open a Confluence page (existing or new).
2. In the editor, type `/`, pick **Team Pulse Board**, insert, publish.
3. The macro renders inline with:
   - **Matching on** — chip row of auto-extracted tokens + a `+ Add word` toggle.
   - **Filter results** — a text field to filter the currently-loaded tickets.
   - **To Do / In Progress / Done** — collapsible sections of matching tickets.
4. Click a ticket key to open it in Jira in a new tab.
5. Click `+ Add word` to add a new match term, or click the ✕ on any user-added chip to remove it; the search re-runs live.
6. Click **Refresh** to re-run the query with the current tokens.

---

## Functional requirements

### FR1 — Macro module

- A `confluence:macro` module named `team-pulse-board-macro`, insertable on any page via the `/` menu.
- Renders inline via UI Kit (`@forge/react`, `render: native`).
- No configuration screen — the page context provides everything.

### FR2 — Auto-extracted title tokens

- On load, the resolver extracts distinctive tokens from the page title:
  - Split on non-letter/number/dash characters.
  - Drop tokens shorter than 3 characters.
  - Drop stopwords (generic English + doc/meeting noise like `plan`, `notes`, `sync`, `Q1`, `FY25`).
  - Keep only distinctive-looking tokens: starts with an uppercase letter, is all caps, or contains internal capitals/digits (`iOS`, `K8s`, `OAuth2`).
  - Cap at 6 tokens (to keep the JQL bounded).
- Each surviving token is rendered as a **read-only lozenge** in the **Matching on** row.

### FR3 — User-added match tokens

- The UI provides a `+ Add word` toggle. When clicked, a compact input + **Add** + **Cancel** row appears. **Enter** submits, **Escape** cancels.
- On add: the token is appended to the extras, the input closes, and the search re-runs.
- Case-insensitive dedupe: adding a token that's already in the auto set or in extras is a no-op.
- Each user-added token is rendered as a **removable teal chip** with a subtle ✕ button. Clicking ✕ removes the token and re-runs the search.
- Extras are **session-only** — not persisted anywhere. A page reload resets to just the auto-extracted tokens.

### FR4 — JQL search

- The resolver builds one unioned JQL string per request:
  - `description ~ "<page-URL>" OR comment ~ "<page-URL>"` (if the page URL is resolvable)
  - `summary ~ "<token>" OR description ~ "<token>"` for each token (auto + extras)
- All clauses OR'd, `ORDER BY updated DESC`, capped at 30 results.
- The resolver prefers `POST /rest/api/3/search/jql` and falls back to `POST /rest/api/3/search` on instances where the enhanced endpoint isn't available.
- The tenant Jira base URL is resolved via `GET /rest/api/3/serverInfo` (not from `issue.self`, which goes through the API proxy) so `browse/{KEY}` links route to the customer's site.

### FR5 — Results UI

- Tickets are grouped into three collapsible sections following ADS disclosure pattern:
  - Left-aligned chevron (`chevron-right` collapsed / `chevron-down` expanded)
  - Section label + count
  - Full-row click target
- Each ticket card shows: key (linked, opens Jira in a new tab), status lozenge, summary, assignee `<User accountId=…>` (clickable avatar → profile), and last-updated date.
- Each section body has a bounded `320px` scroll to keep the panel compact.

### FR6 — Filter results

- A **Filter results** text field lives above the status sections.
- Matches (case-insensitive) against key, summary, status name, and assignee display name.
- Applies to the currently-loaded results — it does *not* re-run the JQL.

### FR7 — Refresh

- Manual **Refresh** button in the header.
- No auto-polling, no websocket, no scheduled re-fetch.

### FR8 — Permissions

- All Jira and Confluence reads are made via `asUser()` — the macro respects the calling user's own permission model. Nothing is elevated.

### FR9 — Empty and error states

- **No related tickets** — a `SectionMessage` explains what happened and suggests widening the search with **+ Add word**.
- **Filter produced no matches** — a subtle line: `No tickets match "<filter>"`.
- **Search failed** — an error `SectionMessage` with a **Try again** button.
- **Loading** — a small spinner + `Searching Jira for tickets related to this page…`
- **Not installed in Jira** — the search call returns 403 and the error state surfaces the message; the README calls this out under Quick start.

### Modules

- **`confluence:macro`** (`team-pulse-board-macro`) — the whole app.
  - Resource: `src/frontend/index.jsx`.
  - Resolver: `index.handler` (backed by `src/resolvers/page-context.js`).
- **`jira:globalPage`** (`team-pulse-board-jira-about`) — minimal Jira surface required for Forge to install the app into Jira (the macro's REST calls need it). Resource: `src/frontend/jira-about.jsx`.
- **`function`** — one handler, `resolver`, wired via `src/index.js`.

### Scopes

- `read:jira-work` — the JQL search + `/serverInfo`.
- `read:jira-user` — resolve display names + avatars for assignees.
- `read:confluence-user` — resolve display names for page contributors.
- `read:confluence-content.summary` — read the current page's metadata (title + URL).
- `read:page:confluence` — read the page's version history.

---

## Prerequisites

- Forge CLI, logged in.
- Node.js 22+.
- A Confluence Cloud + Jira Cloud site the installer can admin (both, on the same tenant).

## Related apps in the collection

- **Smart Workflow Follow-up** — a Jira `trigger`-based automation for posting the same follow-up comment on workflow transitions.
- **Sprint Ready Agent** — a `rovo:agent` that rewrites thin Jira ticket descriptions into a full sprint-ready shape.
