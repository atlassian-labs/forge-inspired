# Forge Inspired

[![Atlassian license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md) [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/atlassian-labs/forge-inspired)

> A collection of small, open-source **Atlassian Forge reference apps** built for the
> **Get Inspired** section of the Forge Developer Journey. Clone, install, and remix.

## Try it in GitHub Codespaces (no local setup)

Prefer not to install Node and the Forge CLI on your laptop? Every demo in this repo ships with a preconfigured **[GitHub Codespaces](https://github.com/features/codespaces)** dev container.

1. Click **Code → Codespaces → New with options…** on the GitHub repo page.
2. In **Dev container configuration**, pick the demo you want to work in (e.g. `smart-workflow-followup`).
3. Wait ~1 minute. The container installs the Forge CLI, runs `npm install` for that demo, and drops you into a terminal.
4. Run:
   ```bash
   forge login       # sign in with an Atlassian API token
   forge register    # first time only — creates your own app id
   forge deploy
   forge install     # pick your Cloud site
   ```

Codespaces gives you a full VS Code-in-the-browser IDE with the demo code, Forge CLI, and the Atlassian VS Code extension pre-installed. See [`.devcontainer/`](.devcontainer/) for the configs.

**These apps demonstrate the Atlassian platform in action.** Each one solves a real developer pain point with a working, cloneable Forge app that spans real Atlassian products — not marketing artefacts.

## Start here

Before any demo in this repo will run, make sure your Forge setup is complete: **[Build and launch your Forge app → Choose your build path](https://developer.atlassian.com/platform/forge/build-and-launch/)**. That page covers installing the Forge CLI, provisioning a Cloud site, and installing the Forge AI development toolkit.

## What's in here

Each demo is a self-contained Forge app. Pick one, `cd` into it, and follow the per-app README.

| Demo | What it demonstrates | Modules |
|------|----------------------|---------|
| [`sprint-ready-agent/`](sprint-ready-agent/) | AI native to the platform — one `rovo:agent` gives you Rovo Chat *and* the Jira ticket Agents panel. Reads freely, writes only after you confirm. | `rovo:agent`, `action` |
| [`smart-workflow-followup/`](smart-workflow-followup/) | Reacting to real Jira events with a Forge `trigger` — no queues, no cron, no server. Per-project opt-in, editable templates, full audit trail. | `trigger`, `jira:globalPage` |
| [`team-pulse-board/`](team-pulse-board/) | Cross-product in a single Forge app — a Confluence macro that runs a live Jira JQL search from words in the page title. Surfaces the ticket↔page connection nobody types. | `confluence:macro`, `jira:globalPage` |

Each folder contains its own `README.md` with the concept, install instructions,
and an `AppRequirements.md` describing what the app does and why.

## Try any demo

Once your Forge setup is complete (see [Start here](#start-here)), every demo follows the same shape:

```bash
git clone https://github.com/atlassian-labs/forge-inspired.git
cd forge-inspired/<demo-folder>
npm install
forge register              # First time only — creates your own app ID
forge deploy
forge install
```

That's it. Open the linked product on your site and follow the per-app `README.md` for what to click.

## Repo layout

```
forge-inspired/
├── LICENSE                          # Apache 2.0, shared by every demo
├── CONTRIBUTING.md                  # shared
├── CODE_OF_CONDUCT.md               # shared
├── .gitignore                       # shared
├── README.md                        # this file
├── sprint-ready-agent/              # demo 1
├── smart-workflow-followup/         # demo 2
├── team-pulse-board/                # demo 3
└── ...
```

Each demo has its **own** `manifest.yml`, `package.json`, and `node_modules/` —
they are deployed and installed independently. Repo-level files (`LICENSE`,
`CONTRIBUTING.md`, etc.) live at the root and are shared.

## Contributions

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for
details. If you have an idea for a new demo, open an issue first so we can
sanity-check the concept before you invest time.

## License

Copyright (c) 2026 Atlassian US., Inc.
Apache 2.0 licensed, see [LICENSE](LICENSE) file.

<br/>

[![With love from Atlassian](https://raw.githubusercontent.com/atlassian-internal/oss-assets/master/banner-cheers.png)](https://www.atlassian.com)
