---
status: accepted
---

# The word board stays only in retained formats

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) retired boards for one canonical model.
That decision removed the concept and not the name.
A reader and an agent still met a word that the glossary forbids, in a package, in code, in copy and in the model.
TASK-564 retires the word from everything that lives, and this record names what keeps it and why.

## Decision

The package `@archboard/board` is now `@archboard/model`.
The glossary points at this name, and the package owns the model's schemas, rules and store.

Live names follow [the glossary](../../CONTEXT.md).
Code, copy, skills and the current model say model, module or canvas.
The renderer's core calls its whole drawing a picture.
In code, `document` names one retained `LegacyBoard` value.
The current model changed through the shared writer, so each continuing subject keeps its identity, and each rename keeps its former name.

A record that is not merged is not history.
[ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) and [the Vello painter](../design/vello-painter.md) came from an open pull request, so TASK-564 rewrote them, and ADR 0071 took a new filename.
A merged ADR, design record or Backlog task stays as it was written.

A word stays only where exact bytes or a published format depend on it, or where the word means something else.
If a value crosses a file or a wire that a retained original uses, keep the key and rename the variable that holds it.

## What keeps the word

These uses are unrelated to the retired concept:

- The product name archboard and every `ARCHBOARD_*` variable.
- Dashboard, clipboard and keyboard.
- "Flip board" in `DESIGN.md`, which names a physical display.
- `backlog board` in `docs/agents/issue-tracker.md`, which is a command of Backlog.md.
- "Explained to a board" in `shared/schemas/walkthrough.ts`, which names a board of directors.

These uses name a legacy board on purpose:

- The glossary term Legacy board in `CONTEXT.md`, and its _Avoid_ entries.
- `LegacyBoard` and the names built on it, such as `parseLegacyBoard`, `renderLegacyBoard` and `drawLegacyBoardHere`.
- The four `legacy-board.ts` and `parse-legacy-board.ts` files, and the `@archboard/model/legacy-board` entry.
- Guides that describe migration or a retained original.

These uses are persisted or published formats, so a retained original keeps reading exactly as before:

- `kind: "semantic-board"` and the `.semantic.json` suffix.
- Decoding and its messages in `shared/schemas/legacy-board.ts`, `shared/rules/coherence/`, `runtime/store/format/` and `runtime/store/legacy-authority.ts`. These messages describe the retained document.
- The address rules in `runtime/store/legacy-address.ts`, such as `SCRATCH_BOARD` and `validateBoardName`.
- The `board` key of a drill-down in `shared/schemas/content.ts`.
- The migration keys `board`, `plannedBoards` and `boards[].source`, in `migration.json`, `migration-readings.ts` and `model-definitions.ts`.
- The qualified identity spellings `model[/original-board]#local-id` and `origin/original-board-id#local-id`.
- The talk keys `board` and `TalkBoardSchema`, and the talk file fallback in `talk-files.ts`.
- The diagnostic `board` key and `sharedSymbol.parts[].board` in `semantic-policy.ts`, which recorded talk policies retain.
- The recipe `board` key in `recipe/schema.ts` and `recipe/legacy-recipe.ts`.
- The listing keys `board` and `boards` in `shared/protocol/legacy-listing.ts`, and the `board` of a parsed document.
- The legacy code opener request `{ board, element }`.
- The skill evaluation format: `board-count`, the `board` key of a suite and a capture, `evals/evals.json`, the run directory `boards/`, `boardsBefore`, `boardsAfter` and the leakage key.

These uses are records of the past:

- `formerNames`, the 18 `Original` walkthroughs, `.archboard/vault/migration.json` and commit-pinned document paths in the vault.
- `examples/web-shop/migration.json`, `examples/legacy-migration/` and the frozen renderer fixtures, with the labels that tests read from them.
- Accepted ADRs, design records and Backlog tasks. This includes `docs/design/wide-board-layout-fixtures/`.
- The retired test file names that `docs/agents/test-suite.md` maps to their owners.

These uses name what is gone, so that a caller gets an answer:

- The refusal of the retired `board` commands in `session.ts`, and the skill text that says those commands are retired.
- The `model-flows.test.ts` check that the retired `/api/semantic-boards` routes stay gone.

Third-party skills under `.agents/skills/` and `.claude/skills/`, and the vendored code under `crates/vendor/`, stay as their authors wrote them.

## Consequences

The word now tells a reader that a value belongs to a retained format.
A new live use is a naming defect, unless it joins the list above with its reason.
