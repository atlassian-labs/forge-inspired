# Rovo Dev prompt — Seed Team Pulse Board demo data

The Team Pulse Board macro derives everything it shows from **real** Confluence pages and Jira tickets on your site — it doesn't ship with any fake data. On a fresh site there's nothing for it to find, so a demo needs a few real artefacts in place first.

This prompt asks **Rovo Dev** to create them for you in about 60 seconds: a Confluence page with a distinctive title, plus a handful of Jira tickets whose summaries and descriptions mention the same distinctive words. That's the whole demo hook — no explicit links between them, but the macro finds them anyway because the JQL matches on the shared words.

**How to use it:**

1. Open a **Rovo Dev** session that has the Atlassian MCP tools available.
2. Tell Rovo which site to use (e.g. `Use the site https://my-tenant.atlassian.net`).
3. Paste the prompt block below.
4. Rovo will tell you what it's about to do at each step and wait for your approval before creating anything.

**You will need**, on the target site:

- Permission to create a Confluence space + page.
- Permission to create Jira issues in **at least one software-type project** (classic software project with To Do / In Progress / Done — not a service desk or business project).
- The Team Pulse Board Forge app installed for **both** Confluence and Jira on the site.
- (Optional) **2–3 other real users assignable on the target site** if you want tickets assigned to different people so avatars show on each card. This is purely cosmetic — the demo works fine with everything unassigned, and on restored/cloned sites cross-site user resolution can be flaky, so Rovo defaults to skipping assignees unless you opt in.

---

## Prompt to paste into Rovo Dev

```
I want to seed demo data for the "Team Pulse Board" Forge macro.

The macro is a Confluence macro that reads the page it's on, extracts
distinctive words from the page title, and runs a JQL search across Jira
projects for tickets whose summary or description mentions those words.
The demo point is that **the tickets never explicitly link the page** — the
macro finds them by shared vocabulary.

Please do the following, asking me to approve each step:

STEP 1 — Pick or create a Confluence space
- Search my Confluence for a space I already own. If you find one, ask if
  I want to use it. Otherwise, create a new space called "Demo — Team
  Pulse Board" with key TPB and confirm.

STEP 2 — Create the demo Confluence page
- Under that space, create a top-level page titled exactly:
      Project Aurora — Nimbus AI Assistant Q4 Launch Campaign Brief
- Body: a short markdown-ish launch brief with sections "Overview",
  "Goals", "Timeline", and "Team". Mention "Aurora" and "Nimbus" a few
  times in the body but do NOT link any Jira ticket keys or URLs.
- The distinctive words in the title (Aurora, Nimbus, Assistant, Campaign)
  are what the macro will match on later.

STEP 3 — Pick a Jira project (software type only)
- Search my Jira projects and ONLY consider projects of type `software`
  (a classic team-managed or company-managed software project with a
  simple To Do / In Progress / Done workflow). Do NOT pick service_desk
  or business projects — their workflows and issue types don't match a
  launch-campaign demo.
- Prefer a software project whose name contains "Marketing" (e.g.
  "Marketing Software Development"). If none exists, list the available
  software projects and ask me which to use.
- If the site has zero software projects, STOP and tell me — do not
  fall back to a JSM or business project silently.

STEP 4 — (OPTIONAL) Assignees
- Assignees are cosmetic — the demo works whether tickets are assigned
  or not, because the Team Pulse Board macro matches on shared
  vocabulary in the summary/description, not on assignee.
- Ask me: "Do you want to assign these tickets to real users, or skip
  assignees entirely and create them unassigned?" Default to skipping
  unless I say otherwise — it's the fastest path to a working demo.
- If I opt in to assignees:
  - CRITICAL: only use users assignable on the site I named at the start
    of this session. Do NOT pull users from any other Atlassian site,
    even if you have their AAIDs cached from earlier context.
  - Use the project's assignable-users endpoint for the project you
    picked in STEP 3 — e.g.
    `GET /rest/api/3/user/assignable/search?project=<KEY>` — so every
    AAID you return is guaranteed to resolve on this site.
  - Do NOT use AAIDs harvested from `assignee` fields on existing
    issues unless you have re-confirmed each one via the
    assignable-users endpoint on the target site (issues can carry
    stale assignees from restored/cloned sites, and those AAIDs will
    silently fail at create time).
  - Show me their display names + AAIDs and ask me to confirm the
    roster.
  - If the assignable-users endpoint returns fewer than 5 users, ask me
    whether to proceed with fewer assignees or fall back to
    unassigned — don't pad the list from other sources.

STEP 5 — Create 7 Jira tickets in that project
- Every ticket's summary MUST contain either "Aurora" or "Nimbus" (or both)
  — this is what the JQL will match. NONE of them should link to the
  Confluence page URL or mention its page ID.
- Vary the statuses across the tickets: some in "To Do", some in
  "In Progress" (or your project's equivalent), some in "Done".
- If STEP 4 produced a roster, assign each ticket to a different user
  from that roster. If STEP 4 was skipped, create every ticket
  unassigned — that's fine.
- Suggested titles (change to fit the project workflow):
    1. "Aurora — landing page copy final review"
    2. "Nimbus AI Assistant — beta signup form"
    3. "Aurora launch email — draft #2"
    4. "Nimbus product screenshot refresh"
    5. "Aurora social kit — LinkedIn + X"
    6. "Nimbus onboarding video storyboard"
    7. "Aurora launch analytics — dashboard setup"

STEP 6 — Report back
- Give me the URL of the Confluence page and a list of the created Jira
  ticket keys + statuses + assignees, so I can verify the seed.

Do not create anything without my approval at each step. If any step fails,
stop and tell me the error — don't try to work around it silently.
```

---

## After running the prompt

1. Deploy and install the Team Pulse Board app on the same site:

   ```bash
   cd team-pulse-board
   forge deploy
   forge install     # install for BOTH Confluence and Jira
   ```

2. Open the Confluence page that Rovo created.
3. Click **Edit**, type `/`, insert **Team Pulse Board**, and publish.
4. You should see:
   - The **Matching on** chip row populated with `Aurora`, `Nimbus`, `Assistant`, `Campaign`, etc.
   - The three collapsible status sections (**To Do**, **In Progress**, **Done**) populated with the tickets Rovo created, grouped by their status.
   - Each ticket card showing the assignee avatar, updated date, and a working link to Jira.
5. Click `+ Add word` and type a term that appears in your project (e.g. `Marketing`) — the search re-runs live and any matching tickets appear.

---

## Cleanup (optional)

To remove the seed data later, ask Rovo Dev:

```
Please delete the demo data you created for the Team Pulse Board seed:
- the Confluence page "Project Aurora — Nimbus AI Assistant Q4 Launch Campaign Brief"
- the 7 Jira tickets you created in <project name>
Ask me to confirm before deleting anything.
```
