---
id: TASK-270
title: Authoring architecture that does not exist yet
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 12:10'
updated_date: '2026-09-18 12:54'
labels: []
dependencies: []
references:
  - docs/adr/0023-semantic-board-model.md
  - src/shared/semantic-board/lib/content.ts
  - src/runtime/semantic-board-store/lib/transitions.ts
  - src/runtime/semantic-board-store/lib/bindings.ts
  - CONTEXT.md
  - skills/archboard/SKILL.md
  - evals/rubric.md
  - src/runtime/skill-evaluation/lib/suite.ts
  - TASK-268
priority: high
type: enhancement
ordinal: 477000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board authored by planning is today indistinguishable, in the document and in the picture, from documentation of code that exists — and both paths open to the author are wrong. Measured by probes through semantic-board-store in throwaway vaults on 2026-09-18.

There is no per-node way to say "proposed". The persisted node is `.strict()` with nine fields (src/shared/semantic-board/lib/content.ts:123-135); `status`, `planned`, `exists` and `lifecycle` are all refused on input. None of the sixteen default kinds says whether a thing is, only what it is (src/shared/semantic-policy/index.ts:98-115), and every visual channel is already allocated (docs/adr/0025:43-67).

What does exist is per-variant: a `draft` branched from `current` carries derived added/unchanged standings that the renderer draws, and ADR 0023:42-45 is explicit that agents never author those flags. That genuinely means "does not exist yet" — but it needs a baseline to branch from, and `createBoardTransition` hard-codes the first variant as `lifecycle: "current"` (src/runtime/semantic-board-store/lib/transitions.ts:171-177) with no input path, while CONTEXT.md:250-252 defines `current` as the variant that describes the architecture that EXISTS. A greenfield board is therefore forcibly labelled as existing, and `semantic compare` is refused for it because a root has no predecessor.

Absence of a `binding` cannot carry the meaning either, and the product says so itself: content.ts:108-109 and ADR 0023:120-121 say a planned node has none, while src/ui/semantic-board-canvas/components/SemanticInspectorParts.tsx:105-108 explains that absence equally means implemented-but-not-bound, "so this says what is missing rather than guessing why". The renderer never reads `binding` at all, so bound and unbound parts draw identically.

So the author either binds the intended paths — and `archboard check` reports BINDING_PATH_MISSING, whose two offered repairs (src/runtime/semantic-board-store/lib/bindings.ts:112-117) are "bind it where the code lives now, or remove the binding", neither of which is "this is planned", and whose whole module is framed around a binding that went STALE rather than one that is AHEAD of the code — or leaves them unbound, as SKILL.md:191 instructs, and the board is silent about existence in every channel. All fifteen eval scenarios assert `check-clean`, so in the harness the first path is an outright failure.

The boundary was unstated before this task: README.md:19-21, CONTEXT.md:3-4 and TASK-211 scope archboard to existing code, while ADR 0023:120-121 and content.ts:108 contemplate planned nodes. The user has decided planning IS in scope, so the representation now needs deciding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records that existence is a fact about a variant and never about a node: a board for something nobody has built carries a draft variant and no current one, and the ADR says why a per-node marker was rejected
- [ ] #2 A board document can represent having no current variant. `current` is a required top-level field today (skills/archboard/references/generated/semantic-board.schema.json:1265), and every reader of it either handles its absence or is shown not to be reachable for such a board
- [ ] #3 Creating a board can leave it without a current variant; `createBoardTransition` hard-codes the first variant as `lifecycle: "current"` today (src/runtime/semantic-board-store/lib/transitions.ts:171-177)
- [ ] #4 Adoption is the moment a planned board becomes the architecture that exists, and what adoption means for a board that had no current variant is defined and works
- [ ] #5 A person opening a board nobody has built sees that from the board itself — in the pane and in the drawing — not only from a variant summary nothing reads
- [ ] #6 A binding that is ahead of the code is either given its own standing by the checker or explicitly decided to be always wrong; BINDING_PATH_MISSING no longer offers only the two repairs that assume a binding went stale (src/runtime/semantic-board-store/lib/bindings.ts:112-117)
- [ ] #7 The runbook steps that read source — gather context, decide the parts, map relationships, the second source pass, walk the catalogue, compare — tell a planning author what stands in for a source line when the mechanism is intended rather than observed
- [ ] #8 The eval suite can express a planning scenario: `flask` and `sources` are not required of every scenario, check-clean is reconsidered where a planned part is bound, and architecturalTruth and behaviouralCompleteness have a planning substitute
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Slice 1 of TASK-270 (criterion #1 plus the audit the notes call for); criteria #2-#8 are a later worker's.

1. Read the record the decision contradicts: ADR 0023, ADR 0025, ADR 0030, CONTEXT.md's Current/Adoption/Variant entries, content.ts's node schema and binding comment, aggregate.ts's document schema, adopt.ts, shelve.ts, transitions.ts, bindings.ts.
2. Write docs/adr/0031 recording that existence is a fact about a variant and never about a node: a board for something nobody has built carries a draft variant and no current one. Give the three reasons a per-node marker was rejected (the node is .strict() with nine fields; every visual channel is allocated and the one a planned marker wants is the one comparison status already takes; it would be a second authored answer to a question the store derives), and say why absence of a binding cannot carry the meaning. Name what is superseded and what happens to each line.
3. Audit every reader of the board's `current` designation across store, server, CLI, renderer, panes and shared schema, saying for each whether it must handle absence or is unreachable for a draft-only board. Answer what adoption means for a board that never had a current variant.
4. Record the audit on this task with --append-notes as the plan of record for the implementation slice, and commit the ADR. Do not change the schema, the store, the skill or the eval suite in this slice.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decided by the user, 2026-09-18: existence is a per-variant fact and per-node makes no sense. A greenfield project simply has a proposed/planned/draft board and no current variant. That removes the representation question this task was filed to open, and replaces it with a narrower one: a board with no current variant is not representable today, because `current` is a required top-level field of the document schema and createBoardTransition hard-codes the first variant to it.

So the shape of the work is: let a board exist with no current variant, and make everything that reads `current` cope. The per-node acceptance criterion that asked a reader to tell an unbuilt part from an external one is withdrawn — on a draft-only board nothing is built, so the question does not arise.

Not yet sized: how much reads board.current across the server, the store, the renderer and the panes. A grep is polluted by React refs and is not a usable count; the worker should audit it deliberately rather than trust a number.

## Slice 1 done: the decision is recorded

`docs/adr/0031-existence-is-a-fact-about-a-variant-never-about-a-node.md` records
criterion #1. Existence is a fact about a variant and never about a node; a board
for something nobody has built carries a draft variant and no current one. The
per-node marker is rejected for three reasons (the node is `.strict()` with nine
fields; every visual channel is allocated and the one a "planned" marker wants is
the one comparison status already takes, so on a draft it says "added" twice and
on the current variant it draws a contradiction; it would be a second, authored
answer to a question the store derives). Absence of a `binding` is refused as a
carrier because the inspector already says in terms that it equally means
implemented-but-not-bound.

Four places in the record are superseded and the implementation slice edits them:
ADR 0023:120-121 ("planned nodes can have no binding"), content.ts:108-109 ("A
planned node has none"), CONTEXT.md:250-252 (Current: the designation is now
optional and its absence says nothing here is built), and ADR 0030:62-63 with
`shelve.ts`:81-86 ("a board with no current architecture is not a board") — that
refusal stands, its stated reason does not.

## Audit: every reader of `current` (the plan of record for criteria #2-#4)

Verified by reading each site on 2026-09-18. A raw grep for `.current` is
useless — ELK route sets (`routes.current` in
`src/transformers/semantic-renderer/lib/layout/compound-*.ts`), lease managers
(`manager.current()`), React refs and `published.current` all match and none is
this field. What follows is the enumeration, not a count.

### The two hard blockers — nothing else runs until these change

1. `src/shared/semantic-board/lib/family.ts`:152-166 (`designationIssues`, reached
   from `checkSemanticBoard` → `parseSemanticBoard`, which runs on every read from
   disk and on every candidate before a write). L152-157 requires **exactly one**
   variant with `lifecycle: "current"`; L159-161 requires `current` to name a
   variant. A draft-only board raises both issues today and is refused on read.
   Must become: zero or one, and the designation present exactly when a variant
   claims it.
2. `src/shared/semantic-board/lib/aggregate.ts`:180 — `current: SemanticIdSchema`
   in the `.strict()` document schema. Make it `.optional()`. The generated
   contract follows: `skills/archboard/references/generated/semantic-board.schema.json`
   (property L1188-1191, `required` L1265) and the repeated copies in
   `docs/design/generated/command-contract-proof.md`, both regenerated artifacts.
   `src/runtime/skill-distribution/lib/schemas.ts`:34 states the old invariant in
   prose shipped to agents ("exactly one variant has lifecycle current") and needs
   rewording.

### The chokepoint, and the one decision the implementation must make first

`aggregate.ts`:217-219 `currentVariant()` already returns `undefined` when the
designation dangles, and `aggregate.ts`:269-274 `resolveVariant(board, asked)`
sends every *unnamed* variant request through it. So almost nothing crashes; it
refuses instead. **The open question criteria #2/#5 hang on: what does a bare
board address resolve to on a board with no current variant?** Today "no variant
named" means "the current one" everywhere — `board-address.ts`:37 calls the word
"privileged: the default everywhere a variant is optional", and it owns the
unadorned board key, the note filename and the pane address. A draft-only board
therefore has no bare-name address at all, and is undrawable, unopenable and
uninspectable by its own name until this is decided. Three candidates: resolve to
the sole draft when there is exactly one; resolve to the root draft; or keep
refusing and require every address to name the variant. The first two make a
planning board usable without the author repeating a variant name in every
command; the third makes every surface below refuse with a message that must then
be rewritten to say *why* rather than "no variant called """.

### Readers that must handle absence (reachable for a draft-only board)

Renderer
- `src/transformers/semantic-renderer/board.ts`:182 — `resolveVariant(board, choices.variant)`,
  refusing `UNKNOWN_VARIANT: this board has no variant called ""`. Highest blast
  radius: every canvas pane, `semantic render` and `semantic rasterize` that does
  not name a variant lands here, so a draft-only board is undrawable by its name.

Store
- `transitions.ts`:213 (branch) — `resolveVariant(before, input.from)` with the CLI
  defaulting `from` to `"current"` (`src/cli/commands/semantic.ts`:378). Branching a
  second draft would refuse without an explicit `--from`.
- `transitions.ts`:258 + 492 (edit) — `const wanted = input.variant ?? "current"`.
  An unqualified agent edit — the most-travelled write path there is — refuses.
- `transitions.ts`:327-331 (settle) — reads `before.current` only to phrase the
  refusal; interpolates the literal `undefined` when absent.
- `transitions.ts`:168 and 174 (create) — the writers criterion #3 changes.
- `adopt.ts`:39 — `from: board.current` in the `Adoption` record; needs a
  conditional spread (see adoption, below).

Server
- `src/server/canvas/lib/pane-registry.ts`:286 (`stillThere`) — a reconnecting pane
  whose key is the bare board name is judged "not there" and **silently loses its
  board**. The worst failure in the list because it is quiet.
- `src/server/canvas/lib/pane-show-route.ts`:84 — `archboard pane show <board>`
  404s with `VARIANT_MISSING`.
- `src/server/code-opener/lib/routes.ts`:133 — following a code binding from a
  bare-name pane answers `BOARD_NOT_FOUND`: `This board has no variant called ""`.
- `src/server/canvas/lib/semantic-board-context.ts`:232 (`readingVariant`, the
  no-pane case) — returns `undefined`, so an agent asking about a board nobody has
  open gets the not-yet-drawn brief. Reachable, and the fallback sentence at L252
  is already guarded but the surrounding prose says "is open in a pane that has
  not drawn yet", which is the wrong sentence here.

CLI
- `src/cli/commands/semantic-inspect.ts`:186 and `semantic-compare.ts`:443 —
  `askedVariant` throws `CliUsageError: "X" has no variant called ""` for an
  unqualified `semantic inspect` / `semantic compare`.
- `src/cli/commands/semantic.ts`:378 — `from: input.from ?? "current"` (above).
- Flag and command help asserting "the current one when absent":
  `semantic.ts`:166, 192, 292, 319; `semantic-render.ts`:84;
  `semantic-rasterize.ts`:127; `semantic-lifecycle.ts`:61, 81, 173-176, 286.

UI
- `src/ui/semantic-board-canvas/lib/local-pictures.ts`:247-248 — the one direct
  read of `document.current` in the browser. With it absent nothing is filtered
  out, so the prefetch list becomes `["", ...every draft id]`: the `""` request
  fails to render and every draft is fetched twice.
- `src/ui/semantic-board-canvas/components/SemanticInspector.tsx`:383-386 — says
  "The variant on screen is not in this board any more", which on a draft-only
  board addressed bare is a lie about a removal that never happened.
- `src/ui/semantic-board-canvas/components/SemanticBoardStage.tsx`:496-499 — the
  pane reports the variant the *server resolved*; the render having failed, it
  reports `variant: null`, which `semantic-board-context.ts`:235 then refuses to
  resolve. Net effect: the agent brief for such a board goes blank.
- `src/ui/board-catalog/listing.ts`:107-111 (`listedBoardKey`) — with no variant
  marked current the lookup finds nothing and returns the key unchanged, so the
  navigator fails to highlight the row for a bare-name pane. Degrades quietly.

### Readers already correct — no change needed

- `aggregate.ts`:217-219 `currentVariant` — documented to return `undefined` when
  the designation dangles, and does.
- `src/ui/semantic-board-canvas/lib/drill-target.ts`:41-46 with
  `components/SemanticDrillDown.tsx`:95-97 — a dedicated `no-current` outcome and
  the sentence "`<board>` has no current variant, and this link asks for whichever
  one is." **The only complete "no current variant" experience in the product
  today**, and it needs no rewording under this decision: ADR 0023:111-112 already
  rules that a link never silently falls back.
- `src/ui/semantic-board-canvas/lib/board-document.ts`:464-468 — the variant picker
  still renders with every draft listed and nothing shown. The best-behaved reader.
- `src/ui/semantic-board-canvas/components/SemanticVariantBar.tsx`:67 and
  `src/ui/application/pane-reading.ts`:31 and `src/ui/board-catalog/listing.ts`:33 —
  all branch on `lifecycle === "current"`, not on the field, so on a draft-only
  board every variant is simply addressed by id.
- `adopt.ts`:61 (`ALREADY_CURRENT`) and `adopt.ts`:132-134 (`designated`) — with
  `board.current` undefined the first comparison is false and the second demotes
  nothing, which is the behaviour wanted.
- `shelve.ts`:81 — the guard is inert when there is no current variant, which is
  right; only its wording is superseded.
- `content-checks.ts`:44 — content edits admitted for `current` **or** `draft`, so
  a draft-only board is editable already.
- `family.ts`:44-51 — still refuses a variant literally named "current". Unaffected.

### Unreachable for a board that never had a current variant

- `src/cli/commands/semantic-lifecycle.ts`:259-263 — reads `board.current` to phrase
  the diagnostic, but only on the board **returned by a successful adopt**, where
  the designation has just been set. It is a textual read of the field, not a case
  to handle.
- `src/server/canvas/lib/semantic-board-context.ts`:475 (`predecessorOf`) and
  `semantic-compare.ts`:463 — resolve `variant.parent`, always a real id.
- `src/runtime/engine/lib/board-address.ts` and `engine/panes.ts`:299 — these are
  the **legacy Excalidraw** address path, where `current` is a variant *name* owning
  the unadorned `.excalidraw.md` filename, not the semantic document's designation.
  Do not change them for this work; only note that the semantic surfaces reusing
  `makeIdentity` (`board-address.ts`:273 defaults a stated variant to the word
  `"current"`) are what makes the bare-address question above unavoidable.
- `src/ui/shell/lib/navigator-entries.ts`:47-48, `shell/components/Header.tsx`:104,
  `application/shell-view.ts`:13, `pane-session/lib/pane-core.ts`:234/504 —
  synthesise or hide the *word* "current" in a display identity. Safe as they
  stand; the breadcrumb would simply always show `board / <draft name>`.

### Not this slice, and owned elsewhere — do not edit under TASK-270 without checking

`src/runtime/skill-evaluation/**` reads `current` in `lib/reading.ts`:84/173,
`lib/outcomes-family.ts`:216-217/229-233/255-257/265, `lib/naming.ts`:246,
`lib/vault.ts`:224, `lib/outcomes-board.ts`:339, `lib/suite.ts`:108/126, and
`tests/reading-fixture.ts`:41 makes every fixture board current-designated. Note
one real trap for criterion #8: `outcomes-family.ts`:265 (`current-untouched`)
JSON-stringifies `currentVariant(board)?.content`, so on a board with no current
variant it compares `undefined` to `undefined` and **passes vacuously**.

### Tests that encode the old invariant

`src/shared/semantic-board/tests/coherence.test.ts`:99 asserts the refusal for a
dangling `current`; `src/runtime/semantic-board-store/tests/branching.test.ts`:117
asserts exactly one variant has `lifecycle === "current"`;
`src/runtime/skill-distribution/tests/artifacts.test.ts`:161-203 tests that a bad
lifecycle is refused. Everything else across `src/**/tests` and `tests/system/**`
merely constructs boards with a current variant and keeps passing.

## What adoption means for a board that never had a current variant

**It is the moment the architecture starts existing, and the existing path very
nearly already does the right thing.** Three findings:

1. The record already has room for it. `AdoptionSchema.from` is documented at
   `aggregate.ts`:122-124 as "The variant it took the designation from, absent for
   the first one" — a branch no board can reach today, because creation designates
   the first variant without writing an adoption. A board created with no current
   variant is the first thing that reaches it. `adopt.ts`:39 must become a
   conditional spread so `from` is omitted rather than written as `undefined`.
2. Nothing becomes historical, and that falls out without a change:
   `designated()` (`adopt.ts`:132-134) demotes only the variant whose id equals
   `was`, and `undefined` matches none. Correct — there was no implemented
   architecture to retire.
3. No refusal misfires. `ALREADY_CURRENT` (`adopt.ts`:61) cannot trigger;
   `VARIANT_HISTORICAL` and `VARIANT_SHELVED` are about the adopted variant;
   `VARIANT_UNSETTLED` and `unsettledAbove` walk predecessors, and a root draft has
   none. So adopting the root draft of a planning board is accepted as it stands.

The residue is wording, not mechanism: `semantic-lifecycle.ts`:173-176 describes
adoption entirely as a designation *moving* ("the variant that was current becomes
the architecture that was implemented until now"), which is not what happens the
first time. And the store should decide whether adopting on a board with no current
variant is the same command or reads differently to an author — recommendation: the
same command, because it is the same act, with the help text and the post-adopt
diagnostic taught to say "is now the architecture this board says is implemented"
without implying something was displaced.

## Not determined in this slice

- Which of the three bare-address resolutions above to take. It is a product
  decision that shapes criteria #2 and #5 and was not settled by the user's note.
- Whether `variants: z.array(...).min(1)` should stay at one or rise — out of scope,
  but note that a board with no variants at all is still refused, which is right.

REVIEW OF THE ADR+AUDIT SLICE, 2026-09-18, recorded here so it survives a machine reboot. Not yet addressed. Verdict: fundamentally sound - the reviewer spot-checked about 40 citations against the working tree and every substantive one is correct to the line. Four real gaps and one piece of misleading guidance.

MUST FIX

1. CONTEXT.md:250-252 must actually be EDITED, not superseded from an ADR. ADR 0031:113-118 says "The entry records that the designation is optional" in the present tense about an edit that has not happened; a reader following that pointer lands on the opposite sentence. Repo precedent is unambiguous - ADR 0025 (CONTEXT.md +77), 0029 (+28) and 0030 (+18) each shipped the glossary edit in the SAME commit, and TASK-261's notes planned the wording explicitly. ADR 0023 is the only one that did not, and it predates the vocabulary being in CONTEXT.md. The domain-modeling skill says CONTEXT.md is updated inline when a term resolves, never batched. An ADR records WHY a term changed; it is not a place a term can live in a superseded state, because CONTEXT.md is what an agent reads first. Edit the Current entry in this slice.

2. The adoption half of the decision has two unaudited contradictions in the record, both missed by ADR and audit alike. CONTEXT.md:255-257 (Adoption) says adoption retains "the formerly current state as named history", and ADR 0023:70-72 says it "preserves the former current under its original name" - while ADR 0031's own consequence says "Nothing becomes historical, because nothing was current". Direct contradiction, in the glossary, for exactly the case criterion 4 is about. The audit did catch the code wording at semantic-lifecycle.ts:173-176 but missed the two documents of record that say it first. Add both to the supersession list and amend the Adoption entry alongside the Current entry.

3. "Do not change board-address.ts" is the WRONG instruction, and it is the one the brief worried about. There is one board-address.ts (src/runtime/engine/lib/board-address.ts) and it is not confined to the Excalidraw path: parseBoardKey (L358) -> makeIdentity (L268) -> variant: validateVariant(input.variant ?? CURRENT_VARIANT) (L273) is live on pane-registry.ts:300, pane-show-route.ts:45, semantic-board-context.ts:177, websocket-connection.ts:99, pane-routes.ts:175 and semantic-board-store/lib/location.ts:66,120. BoardIdentity.variant is a required string, so a bare key is MATERIALISED as the literal "current" before any semantic code sees it - the pane layer cannot represent "no variant stated" today. Whichever bare-address resolution is chosen, that is where it lands. Rewrite the bullet: the filename/.excalidraw.md logic is legacy and untouched, while makeIdentity/parseBoardKey/paneBoardAddress are the live semantic address grammar and the expected site of the decision.

4. The schema version question is never raised and nothing will fail if it is missed. aggregate.ts:31-40 documents SEMANTIC_BOARD_SCHEMA_VERSION = "2.2.0" with a line per contract change, and L42-50 justifies accepting a later minor because "anything genuinely new arrives as a field this build does not know, and that is already refused" - which covers ADDITIVE minors only. Making current optional is subtractive: a 2.2.0 build reading a newer document with no current passes versionIssues (family.ts:211-224, same major) and then fails the Zod parse with a bare "current: required" rather than a version refusal. No test catches it, since artifacts.test.ts compares generated to live and both move together. Decide and record: bump to 2.3.0 with its doc-comment entry, or state why the optionality does not warrant one. Criterion 2 owns it.

5. "The only code change is adopt.ts:39" is not quite true. The adoption chain was verified link by link and holds (AdoptionSchema.from optional and documented absent for the first one at aggregate.ts:122-124; designated() at adopt.ts:130-134 demotes only variant.id === was so undefined demotes nothing; ALREADY_CURRENT at adopt.ts:61 compares against board.current and is false; unsettledAbove walks parent, which a root draft lacks; BoardAdoptInputSchema.variant is required at resolution.ts:66). But adopt.ts:48 passes board.current as `was` into designated(variant, becoming, was: string), so once current is string | undefined the SIGNATURE must widen. Self-revealing at type-check, but a plan is trusted on its claims.

OPTIONAL

- Two resolveVariant callers missing from an enumeration that bills itself as complete: transitions.ts:366 (adopt) and :398 (shelve). Both safe because their input schemas require a variant, but a user typing --variant current on a draft-only board gets "this board has no variant called current", which is worth phrasing. Say they were considered.
- Agent-facing prose is unassigned. The plan names skill-distribution/lib/schemas.ts:34 but nothing in skills/archboard/: SKILL.md:15 and references/variants.md:7,14,125-126 all assume every board has a current variant, and criterion 3's whole point has no agent-facing instruction anywhere in the plan. Probably criterion 7's, but say so.
- coherence.test.ts:99 is mis-filed under "tests that encode the old invariant": it asserts a DANGLING designation (current: "nope") is refused, which stays correct under the decision. A worker clearing that list could weaken a test that should survive.
- reading-fixture.ts:41 is current: variants[0]?.id with lifecycle "draft" defaulted on L42, so the fixtures designate a current variant that is marked draft - already incoherent by designationIssues' rule and evidently never re-parsed. Harmless, but "makes every fixture board current-designated" will mislead whoever works criterion 8.
- Name the regeneration command (bun run generate:skill-artifacts) beside the two generated artifacts.

THE BARE-ADDRESS RECOMMENDATION: THE THREE CANDIDATES ARE NOT THE OPTION SPACE.

resolveVariant(board, undefined) currently answers two different questions with one lookup: (1) which variant is the implemented architecture - a semantic question whose truthful answer on a planning board is NONE; and (2) which variant do I draw when nobody said - an addressing question that needs SOMETHING. ADR 0031 is entirely about question 1. Candidates (a) the sole draft and (b) the root draft answer question 2 by corrupting question 1, and there is a concrete casualty: drill-target.ts:42 calls resolveVariant(reading.board) with no `asked` to serve a link whose author explicitly wrote kind: "current". Implementing (a) or (b) inside resolveVariant silently turns {kind: "no-current"} into showing the draft, destroying the SemanticDrillDown.tsx:95-97 sentence the audit calls the only complete no-current experience in the product, and violating ADR 0023:111-112 and ADR 0031's own drill-down consequence.

FOURTH OPTION, recommended: give the ADDRESS its own resolution, distinct from the designation. Keep currentVariant() and resolveVariant() semantically truthful and unchanged. Add a separate reading default - addressedVariant(board, asked) or similar: the current variant when there is one; otherwise the board's sole draft; when there are several drafts and no current, the root draft; refuse only if even that is ambiguous, naming the candidates. Use it ONLY where the question is "what do I draw": semantic-renderer/board.ts:182, the pane address path (makeIdentity/parseBoardKey, pane-registry.ts:286, pane-show-route.ts:84, code-opener/lib/routes.ts:133), local-pictures.ts:247-248, board-catalog/listing.ts:107-111. Leave resolveVariant/currentVariant to the places asking whether something is implemented: drill-down, adopt, shelve, semantic-board-context.ts:252, and the eval outcome checks.

Why: it is the only option under which both "the bare address opens something" and "asking which variant is implemented answers nothing" are true - (c) gives up the first, (a)/(b) give up the second. Criterion 5 requires a person opening a board nobody has built to see that in the pane AND in the drawing, and you cannot see a drawing that refuses, so (c) is in tension with an agreed criterion. It keeps `current` meaning exactly one thing, which is ADR 0031's entire thesis; widening the designation to also mean "the default reading" reintroduces the conflation the ADR just removed. (b) alone ages badly - the root draft is the least interesting variant the moment a planning board branches alternatives, which is the first thing a planning board does - and (a) alone leaves the multi-draft case undefined. It is cheap: SemanticVariantBar.tsx:67, pane-reading.ts:31 and listing.ts:33 all branch on lifecycle === "current", so on a draft-only board the UI already re-addresses everything as board@<id> after the first draw, and the bare address matters chiefly at ENTRY points - a typed pane show, a catalogue row, a reconnect, a code-binding follow - a small enumerable set. And it is in the grain of the stated invariant that only what is DRAWN depends on the variant.

If the smallest possible change is wanted instead, (c) is defensible - but pane-registry.ts:286 must be fixed regardless, because a reconnecting pane currently loses its board SILENTLY rather than refusing visibly, and the refusal messages must say why rather than "no variant called """.

CONFIRMED: outcomes-family.ts:265 is vacuous as flagged - currentJson returns JSON.stringify(undefined) -> undefined, and currentUntouched compares undefined === undefined. No other outcome check has that shape (currentIs fails honestly via isNamed; reading.ts:84/:173 report loudly). One adjacent thing for criterion 8's worker: reading.ts:84 means EVERY variant-unqualified eval check silently retargets on a draft-only board.
<!-- SECTION:NOTES:END -->
