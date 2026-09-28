# Implementation Plan Agent — App Requirements

## Purpose

Give engineers a Rovo agent that turns a Jira issue into an actionable implementation plan, grounded in the team's own knowledge, and records that plan on the issue as a comment — so the plan is visible to everyone else on the team, not stuck in a chat window.

Delivered as a **workshop**: two side-by-side Forge apps in one folder, so participants can start from the vanilla template and evolve it into the finished agent.

## User story

> As an engineer picking up a Jira issue, I want to ask an agent for an implementation plan grounded in my team's context so I can start the work with a shared understanding of scope, approach, and risks — without leaving Jira.

## In scope

- One `rovo:agent` module usable from both Rovo Chat and the Jira issue Agents panel.
- One read action (`inspect-issue`) that returns a lean JSON view of the issue: summary, description (ADF flattened to plain text), issue type, status, priority, assignee, reporter, labels.
- One write action (`post-implementation-plan`) that posts a single comment on the issue containing the drafted plan. The comment is prefixed with a marker line so it's easy to identify agent-authored comments in ticket history.
- Rovo's built-in access to organizational knowledge is used implicitly by the agent to ground the plan; the app does not need to wire any external knowledge source.
- Two independently-deployable Forge apps: `baseline/` (workshop starting point) and `solution/` (finished reference).

## Out of scope

- **Custom fields.** By design — keeping the read surface small makes the workshop easier to follow.
- **Multiple comments per invocation.** The prompt explicitly instructs the agent to post exactly one comment per request.
- **Editing any Jira field other than comments** (no description edits, no status transitions, no field mutations).
- **Chat-side confirmation flow** (unlike `sprint-ready-agent`, this app posts the plan directly — the payoff is the plan appearing on the ticket).
- **Storage.** The app is stateless; every invocation reads fresh from Jira.

## Modules

- `rovo:agent` — the agent definition, prompt, conversation starters, and its two allowed actions.
- `action` × 2 — `inspect-issue` (`GET`) and `post-implementation-plan` (`TRIGGER`).
- `function` × 2 — the JavaScript handlers backing the two actions.

## Scopes

- `read:jira-work` — required to read issue fields.
- `read:jira-user` — required to resolve assignee/reporter display names.
- `write:jira-work` — required to post the comment.

All Jira calls are made with `asUser()`, so the agent's effective access is bounded by the invoking user's Jira permissions.

## Success criteria

1. A workshop participant can `forge deploy && forge install` the baseline in under 5 minutes on a clean dev environment.
2. A workshop participant can, following the README, evolve the baseline into an agent that reads and comments on a Jira issue within a 60-minute session.
3. Running the finished solution end-to-end on a real Jira issue results in exactly one comment being posted, containing a plan with the four expected sections.
