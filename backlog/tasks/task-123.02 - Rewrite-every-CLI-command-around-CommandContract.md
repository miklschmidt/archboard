---
id: TASK-123.02
title: Rewrite every CLI command around CommandContract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 23:58'
updated_date: '2026-08-26 08:20'
labels: []
dependencies:
  - TASK-123.01
references:
  - src/cli/run.ts
  - src/cli/args.ts
  - src/cli/util.ts
  - src/cli/commands
  - src/core/canvas-client.ts
  - tasks/task-123.01
parent_task_id: TASK-123
priority: high
type: task
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate the full public Archboard CLI from the hand-written registry, raw argv handlers, scattered flag parsing, and anonymous printJson calls to the approved CommandContract and local Zod-to-Commander adapter from TASK-123.01. Preserve public command names, options, defaults, output meanings, refusal behavior, and established exit codes unless an explicitly linked task approves a compatibility change.

Each command handler accepts inferred validated input and returns an inferred domain result. The command boundary validates that result against its declared Zod schema and owns serialization. Command modules do not print, set process exits ad hoc, parse argv, or import Commander. Shared result concepts such as board identity, fingerprint, affected elements, generated handles, and refusal details use reusable schemas rather than structurally similar anonymous objects.

Migrate in vertical slices while keeping the complete CLI usable and tests green. Remove the legacy dispatcher and parsing helpers when the last command moves; do not leave two permanent command-definition systems.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every existing public command and subcommand is registered through CommandContract and handled through the local adapter, with no command handler receiving raw argv or importing Commander.
- [ ] #2 Every structured-success path returns a named, exported Zod result schema and inferred TypeScript type; the command boundary performs validation and serialization, and handlers contain no printJson calls.
- [ ] #3 Reusable schemas define shared board addresses, versions and fingerprints, affected and generated elements, stable handles, file artifacts, browser and server state, and refusal details without forcing unrelated commands into one oversized envelope.
- [ ] #4 JSON stdout remains valid and free of diagnostics; text, raw-content, and file-output commands use explicit contract modes; declared errors and refusals map consistently to stderr and established process exits.
- [ ] #5 Public command names, aliases, flags, defaults, stdin and file behavior, output meanings, ordering guarantees, browser and server prerequisites, and write semantics remain compatible except where a linked approved task specifies a change.
- [ ] #6 Legacy command registry, duplicated argument parsers, handler-side printing, and obsolete usage strings are deleted after migration, leaving one command-definition path.
- [ ] #7 Tests exercise every command contract plus representative end-to-end invocations, including invalid and cross-field input, invalid handler output, one-write enforcement, optimistic concurrency, absent browser or server, stdin, files, text mode, and jq consumption.
- [ ] #8 The CLI continues to run from source under the repository Bun version requirements, and Commander remains confined to the adapter boundary.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 08:20
---
Planning started after TASK-123.01 completed and was pushed at 91ddd3d7acba1518a2726d7cd7aebb08e6b885ba. Implementation requires parent approval of the recorded plan.
---
<!-- COMMENTS:END -->
