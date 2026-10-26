---
id: TASK-526.04
title: render --track makes a tracked embed that its board lists
status: Done
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T23:58:00Z'
labels:
  - cli
  - schema
  - code-check
dependencies:
  - TASK-526.03
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 924000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A change in the vault repository can make an embed in another repository outdated, and that repository is often not checked out on the machine that made the change. The owner wants the board side to know where its pictures are shown, by explicit opt-in. ADR 0057 decides a board-level list of { repo, path }, why the vault side reports information and not a warning, and how a move carries the list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 semantic render --out <file> --track adds { repo, path } to a board-level list, and semantic show returns the list
- [x] #2 --track takes the lease, needs --doing from an agent and raises the version, and does not move the last change that behind reads
- [x] #3 --track is refused when no registered checkout of the vault repository exists or the file is in no Git checkout
- [x] #4 In the vault repository, check embeds reports an outdated tracked embed of another repository as information
- [x] #5 --fix in the vault repository draws a tracked embed again only in a registered checkout, and names the others
- [x] #6 After a move, the target vault check names each tracked embed whose recipe names the old repository, and --fix rewrites the recipe
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board proposals. Command interface@TASK-526.04 adds the Tracked embed module under Commands. It is bound to apps/cli/src/cli/operations/semantic/draw/tracked-embed.ts. Render and Rasterize call it, and it calls Request transport. Embeds check also calls Request transport for the tracked embeds of the vault. Board persistence@TASK-526.04 adds the Track an embed transition under Board transitions. Archboard server calls it, and Write under lease applies it. Archboard server routes@TASK-526.04 adds the Track embed route under Board writes. Board routes mount it, and Agent CLI calls it. It writes through Semantic board store, answers through Board write routes and requires a vault.
2. Board schema. A board gets the optional list trackedEmbeds of { repo, path }. The path is a file from the root of its repository, with no empty, . or .. segment. The schema version does not move. The listing reports the list of each board.
3. Store. trackEmbedTransition adds one entry and changes no variant. It refuses an entry that the board lists already with EMBED_ALREADY_TRACKED. changesExistingBoard is false, so the write needs no stated version.
4. Server. POST /api/semantic-boards/track-embed takes the envelope, the doing line and the lease. When the caller states a version, it checks it. It answers EMBED_ALREADY_TRACKED as the board unchanged.
5. CLI. semantic render and rasterize get --track, which needs --out and --doing. When no checkout holds the file, or the checkout ignores it, the command refuses with TRACK_OUTSIDE_CHECKOUT. When no registered checkout of the vault repository exists, it refuses with TRACK_VAULT_UNREGISTERED. The track write lands before the file is written. The receipt carries tracked { repo, path, version }.
6. check embeds. The check reads the tracked embeds of the vault from the listing. It reads a file of another repository in the chosen registered checkout of that repository, with the rules for a checkout embed. Every finding about such a file is information and names embedRepo. When a board of this vault holds the board of a tracked embed, the check reads it against this vault. If its recipe names another repository, the finding is EMBED_VAULT_MOVED, and --fix writes the recipe again. EMBED_TRACKED_UNREACHABLE and EMBED_TRACKED_MISSING are information. The repo field of a finding becomes vaultRepo. A fix carries embedRepo and movedFrom. The part lists tracked.
7. Tests. A unit test owns the transition. The behind fixture shows that a tracked embed does not move the last change. A system test runs over four repositories.
8. The gate, the code check diff and the footprint. The proposals stay unadopted.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in commits 68d83be44, a8df9cc0e, f8b023757 and 1d7c8e2f6. The proposals are in 6e013d270.

Decision: --track needs no --expect-version. The write only adds an entry to a list, so it cannot undo the change of another writer. The transition says changesExistingBoard false, as a create does. When a caller states a version, the route checks it. render and rasterize do not declare --expect-version.

Decision: rasterize also takes --track. A PNG with a recipe is an embed, and check embeds --fix draws it again. So both drawing commands share one option and one helper (tracked-embed.ts).

Decision: --track also refuses a file that the checkout ignores, with the code TRACK_OUTSIDE_CHECKOUT. ADR 0057 says that an ignored render is no embed, so a board must not list it.

Decision: TRACK_VAULT_UNREGISTERED compares the vault repository of the recipe with the registry, and needs a registered checkout whose directory exists. A vault in no repository has a null repository in its recipe, so it is refused too. The command registers the checkout of its own vault before the handler runs, so in practice this refuses an untracked vault.

Decision: the track write lands before the file is written. When the write is refused (no --doing, a held board, a revoked claim), no file is written. If the file write fails after the track write, the list names a file that is not there. The vault check then reports it as EMBED_TRACKED_MISSING information.

Decision: tracking a file twice is tracking it once. The transition refuses EMBED_ALREADY_TRACKED, and the route answers that refusal with the board unchanged, at the same version. The receipt then shows the same version.

Decision: in the answer, the repo field of a finding is now vaultRepo (the vault that the recipe names). embedRepo names the repository of a file that is not in this checkout. A fix carries embedRepo and movedFrom. The part lists every tracked embed in tracked. A merge with a branch that still writes repo on a finding fails the type check.

Decision: every finding about a file of another repository is information. findingOn lowers the severity, so one rule covers each code. EMBED_VAULT_MOVED is a warning for a file in the checkout of the vault, and information for another repository.

Decision: a tracked embed of the own repository that is not an embed of its board in this checkout is EMBED_TRACKED_MISSING information. This includes a fresh render that is not committed yet.

Decision: for a move, the check does not change the vault resolution in embed-vaults.ts. A board of this vault can track the file and hold the board id of its recipe. Then the check reads the embed against this vault, through the vault reader with the own identity. Then the usual standing applies. A recipe-only difference makes --fix write the recipe of this vault, and a changed picture makes --fix draw the file again. Both name movedFrom.

No edit to embed-vaults.ts and no edit to packages/server-lifecycle. The CLI sends the track write and reads the tracked list with requestJson, as vault.ts and footprint.ts do. render does not declare --as-session, so the track write names no session, and its news reaches its own author too.

Out of scope: check embeds in a docs repository without a vault is refused with VAULT_NOT_FOUND, because the command needs a vault. The system test gives the docs repository a vault. The parent decides if a checkout without a vault runs the embeds check.

Code check diff (check code with and without --variant TASK-526.04). No finding added and none cleared, after the proposal drew Track embed route to Vault requirement.

Footprint against 020258b51 (68d83be44^). Command interface: namedAndChanged Rasterize, Render, Embeds check, Tracked embed. changedNotNamed Vault check (vault.ts: the description of the embeds check and its listing relationship, metadata only; the board stays true) and Commands (the container of the named parts). namedNotChanged Request transport, named only by a relationship. Board persistence: namedAndChanged Track an embed. changedNotNamed Lifecycle transitions (transitions.ts: the doc comment of changesExistingBoard only). namedNotChanged Write under lease, named only by a relationship. Archboard server routes: namedAndChanged Board routes, Track embed route. namedNotChanged Board write routes and Vault requirement, named only by relationships.

Closing evidence: tests/system/semantic-boards/tracked-embeds.test.ts (4 cases, pass) owns criteria 1 to 6; packages/board/tests/runtime/operations/embeds/track.test.ts owns the version and the lease; packages/code-intel/tests/runtime/operations/history-lens/behind.test.ts owns 'a tracked embed is no change'. The refusal for a file that Git ignores was never reached, because its directory did not exist; 85602127b makes it reachable, and the case fails with that refusal removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic render and rasterize take --track. The board gains a board-level trackedEmbeds list of {repo, path}, written through the board write boundary (lease, --doing, version), and the last change that behind reads does not move. --track is refused for a file in no Git checkout, a file that Git ignores, and a vault whose repository has no registered checkout. In the vault repository, check embeds reads each tracked embed: one in another repository is information, --fix draws it again only in a registered checkout and names the others (EMBED_TRACKED_UNREACHABLE), and after a move EMBED_VAULT_MOVED names each recipe of the old repository and --fix rewrites it. Gate: every lane passes except the timing bounds of wide-boards.test.ts, which another agent's load on this machine makes unmeasurable (see TASK-527).
<!-- SECTION:FINAL_SUMMARY:END -->
