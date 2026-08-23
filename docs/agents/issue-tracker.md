# Issue tracker: Backlog.md

Issues, specs, and planning for this repo live in [Backlog.md](https://backlog.md),
stored as markdown under `backlog/` and driven entirely through the `backlog` CLI.

**Always use the CLI.** Never edit files under `backlog/` by hand — task
metadata, relationships, and history are maintained by the tool and hand edits
desynchronise them. This is also asserted in `AGENTS.md`.

The binary is a dev dependency: `./node_modules/.bin/backlog`, or just `backlog`
if the global install is on PATH (both are 1.50.1). Add `--plain` for
agent-readable output, `--json` for machine-readable.

## Conventions

- **Ticket** = a backlog task. `backlog task create "<title>"`
- **Statuses**: `To Do`, `In Progress`, `Done` (`backlog/config.yml`)
- **Triage state** = task labels; see `triage-labels.md` for the role strings
- **Acceptance criteria**: `--ac "<criterion>"`, repeatable
- **Blocking**: `--depends-on <taskIds>` (alias `--dep`)
- **Subtasks**: `--parent <taskId>`
- **IDs** are zero-padded to 3 digits with a `task` prefix, e.g. `task-001`

## When a skill says "publish to the issue tracker"

```bash
backlog task create "Fix arrow binding on re-import" \
  -l needs-triage \
  --ac "Arrows survive export -> import round-trip" \
  --ac "Covered by a regression test" \
  --dep task-004
```

Use `--draft` when the ticket is not yet ready to be worked.

## When a skill says "fetch the relevant ticket"

```bash
backlog task view task-012 --plain
backlog search "arrow binding" --plain
backlog task list --plain                # grouped by status
```

The user will normally pass the task ID directly.

## Triage operations

Labels are free-form in Backlog.md, so the five canonical role strings are used
verbatim — no mapping needed.

```bash
backlog task edit task-012 -l ready-for-agent      # apply a triage label
backlog task list --plain | grep needs-triage      # the triage queue
```

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent task; each open question is a
**child task** of it.

- **Map**: `backlog task create "Map: <effort>"` — the Notes / Decisions-so-far /
  Fog body lives in its description, appended to as the effort progresses.
- **Child ticket**: `backlog task create "<question>" --parent <mapId>`. Record
  the ticket type (`research` / `prototype` / `grilling` / `task`) as a label.
- **Blocking**: `--depends-on`, so blocking edges are real tracker relationships
  rather than prose. A ticket is unblocked when every dependency is `Done`.
- **Frontier**: children of the map that are `To Do`, unblocked, and unassigned.
  `backlog task list --plain` and filter; lowest ID wins.
- **Claim**: `backlog task edit <id> -s "In Progress" -a @<name>` before any work.
- **Resolve**: `backlog task edit <id> -s Done` with the answer in the
  implementation notes, then append a context pointer (gist + task ID) to the
  map's Decisions-so-far.

## Board and overview

```bash
backlog board          # Kanban view
backlog overview       # project statistics
backlog browser        # local web UI on 127.0.0.1:6420
```
