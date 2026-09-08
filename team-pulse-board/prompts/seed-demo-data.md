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
- Permission to create Jira issues in at least one project.
- The Team Pulse Board Forge app installed for **both** Confluence and Jira on the site.
- Ideally, **2–3 other real users on the site** (colleagues, or shared demo users) so the demo can assign tickets to different people and show avatars in each card.

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

STEP 3 — Pick a Jira project
- Search my Jira projects and pick one I can create issues in.
  Prefer a project called "Marketing" if it exists; otherwise ask me
  which one to use.

STEP 4 — Find 5–7 real users on this site to assign tickets to
- Use the Atlassian user search to find a handful of real users (not just
  me). Show me their names + AAIDs and ask me to confirm the roster.

STEP 5 — Create 7 Jira tickets in that project
- Every ticket's summary MUST contain either "Aurora" or "Nimbus" (or both)
  — this is what the JQL will match. NONE of them should link to the
  Confluence page URL or mention its page ID.
- Vary the statuses across the tickets: some in "To Do", some in
  "In Progress" (or your project's equivalent), some in "Done".
- Assign each ticket to a different user from step 4.
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
