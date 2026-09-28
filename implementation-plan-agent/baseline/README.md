# Baseline — Implementation Plan Agent workshop

> This is your **starting point** for the [Implementation Plan Agent workshop](../README.md). It is the untouched output of `forge create -t rovo-agent-rovo` — a "Hello World" Rovo agent that logs a message to Forge logs and nothing else.
>
> During the workshop you'll evolve this app into the [`solution/`](../solution) version, which reads a Jira issue and posts an implementation plan back as a comment.

## What this agent currently does

- Exposes one Rovo agent (`baseline`) with one action (`hello-world-logger`).
- When you ask it to log a message, it writes that message to Forge logs via `console.log`.

That's it. It doesn't call any Atlassian REST APIs, doesn't need any scopes beyond the default, and doesn't touch Jira.

## Run it

```bash
cd implementation-plan-agent/baseline
npm install
forge register        # First time only — writes YOUR app id into manifest.yml
forge deploy
forge install         # Pick your Jira Cloud site
```

Then open Rovo Chat on your site, pick the **baseline** agent, and ask it to log a message. Tail the logs to confirm:

```bash
forge logs --since 15m
```

## Where to go next

Follow the workshop steps in the [top-level README](../README.md#the-workshop-flow) to grow this into the finished agent. If you get stuck, peek at [`../solution/`](../solution) for the reference implementation.
