# Plans

Reference and planning docs for **Sahayak**. The [root README](../README.md) is
the entry point for setup; this folder is for detail.

Start here:

| If you want to… | Read |
|---|---|
| Get it running | [`runbook.md`](runbook.md) |
| Understand the whole system | [`complete-context/README.md`](complete-context/README.md) |
| Trace a flow end to end | [`complete-context/workflow.md`](complete-context/workflow.md) |
| Know what's still not shipped | [`deferred-before-production.md`](deferred-before-production.md) |

## The docs

### Reference — as-built, keep in sync with the code

| Doc | What it covers |
|---|---|
| [`api-plan.md`](api-plan.md) | Every endpoint, request/response contract, and business rule (BR-\*) |
| [`database-design.md`](database-design.md) | Schema, tables, constraints, migrations |
| [`architecture.md`](architecture.md) | Runtime shape and module layout |
| [`frontend-api-usage.md`](frontend-api-usage.md) | Page → endpoint → payload, per client, plus known drift |
| [`voice-integration.md`](voice-integration.md) | LiveKit voice: token minting, agent dispatch, structured output |
| [`web-portal-gaps.md`](web-portal-gaps.md) | Which police-portal pages are actually built |
| [`pg-db-connection.md`](pg-db-connection.md) | Neon setup, test branches, and the destructive-command guards |

### Orientation and history

| Doc | What it covers |
|---|---|
| [`decisions.md`](decisions.md) | Reverse-chronological log of architecture decisions and why |
| [`client-design/`](client-design/) | Original design specs for the mobile app and police portal. Largely superseded by the code — treat as intent, not as-built |
| [`runbook.md`](runbook.md) | Run commands, police hand-dispatch rules, and a status table |

### Open problems

| Doc | What it covers |
|---|---|
| [`deferred-before-production.md`](deferred-before-production.md) | Deliberate shortcuts that are fine in dev and wrong to ship, each with a fix |

## A note on drift

These docs are only useful while they match the code. When you change behaviour:

- `api-plan.md` / `database-design.md` — update when contracts or schema change.
- `decisions.md` — add a row when you make a decision that would otherwise look
  like a mistake.
- `deferred-before-production.md` — move an item here when you take a shortcut,
  and out when you fix it. This is the one file worth reading before shipping.

Completed build plans were removed rather than kept as history; git has them if
you ever need to see what a given phase was supposed to do.
