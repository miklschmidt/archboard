# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Writing an ADR in this repo

An ADR records a decision, and a decision outlives the code that carries it out.
So write it in the vocabulary of `CONTEXT.md`, about boards, notes, panes,
elements and agents, and not about the code.

**Do not put claims about the code in an ADR.** No file paths, no function or
constant names, no line numbers, no "this already exists" or "this is only one
line". Every one of those is true on the day it is written and unverifiable a
month later, and a reader cannot tell which paragraphs still hold. Worse, a
wrong one sends an implementer to a function that will not do the job.

Cover four things:

- The issue, in domain terms.
- Why it is a problem, with the symptom a person would notice.
- What was considered and rejected, and why.
- What was decided, and what follows from it.

Evidence from a bug is fine and is usually what makes a decision persuasive,
but describe the symptom rather than the mechanism: "a label multiplied on
every round trip until the edge collapsed" rather than the name of the function
that did it. Task ids are durable and worth citing; source locations are not.

Measurements belong in a design document under `docs/design/`, which is dated,
disposable and expected to age. An ADR is neither.
