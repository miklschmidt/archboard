---
id: TASK-270
title: Authoring architecture that does not exist yet
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 12:10'
updated_date: '2026-09-23 01:39'
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
- [x] #2 A board document can represent having no current variant. `current` is a required top-level field today (skills/archboard/references/generated/semantic-board.schema.json:1265), and every reader of it either handles its absence or is shown not to be reachable for such a board
- [x] #3 Creating a board can leave it without a current variant; `createBoardTransition` hard-codes the first variant as `lifecycle: "current"` today (src/runtime/semantic-board-store/lib/transitions.ts:171-177)
- [x] #4 Adoption is the moment a planned board becomes the architecture that exists, and what adoption means for a board that had no current variant is defined and works
- [ ] #5 A person opening a board nobody has built sees that from the board itself — in the pane and in the drawing — not only from a variant summary nothing reads
- [x] #6 A binding that is ahead of the code is either given its own standing by the checker or explicitly decided to be always wrong; BINDING_PATH_MISSING no longer offers only the two repairs that assume a binding went stale (src/runtime/semantic-board-store/lib/bindings.ts:112-117)
- [x] #7 The runbook steps that read source — gather context, decide the parts, map relationships, the second source pass, walk the catalogue, compare — tell a planning author what stands in for a source line when the mechanism is intended rather than observed
- [x] #8 The eval suite can express a planning scenario: `flask` and `sources` are not required of every scenario, check-clean is reconsidered where a planned part is bound, and architecturalTruth and behaviouralCompleteness have a planning substitute
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

## Review addressed, 2026-09-18: corrections to the audit above

Where this note and the audit above disagree, this note wins.

**1. CONTEXT.md has been edited, not left for later.** The Current entry now says a
board has at most one, and that its absence is how a board says nothing it
describes exists. The Adoption entry now covers both cases: a formerly current
state is retained as history, while on a board that had none, adoption is the
moment the architecture starts existing and nothing becomes history. ADR 0031's
supersession list now describes these edits as done.

**2. Two adoption contradictions added to the supersession list:** CONTEXT.md's
Adoption entry (edited, above) and ADR 0023:70-72 ("preserves the former current
under its original name"). The ADR 0023 sentence still holds for a board that had
a current variant, and is superseded for a board that did not. The implementation
slice amends it, together with ADR 0023:120-121.

**3. Correction: `board-address.ts` is NOT out of scope.** The audit's bullet
telling the implementation worker to leave it alone was wrong. There is one
`src/runtime/engine/lib/board-address.ts`. Its filename and `.excalidraw.md`
logic (`noteBaseName`, `BOARD_FILE_SUFFIX`, `archboardOwnPath`) is legacy and stays
untouched. But `parseBoardKey` (L358), `makeIdentity` (L268, with
`validateVariant(input.variant ?? CURRENT_VARIANT)` at L273) and
`paneBoardAddress` form the **live semantic address grammar**. The semantic
surfaces call them at `pane-registry.ts`:300, `pane-show-route.ts`:45,
`semantic-board-context.ts`:177, `websocket-connection.ts`:99, `pane-routes.ts`:175
and `semantic-board-store/lib/location.ts`:66,120. `BoardIdentity.variant` is a
required string, so a bare key becomes the literal `"current"` before any semantic
code sees it, and the pane layer cannot represent "no variant stated" today.
Whatever the bare-address decision turns out to be, it lands here first.

**4. Schema version: bump to 2.3.0, as a record rather than a guard.** Plan for
criterion 2:
- `SEMANTIC_BOARD_SCHEMA_VERSION` goes to `"2.3.0"`, with a doc-comment line in
  `aggregate.ts`:31-40: "`2.3.0` makes the current designation optional: a board
  for something nobody has built has none."
- Rewrite `aggregate.ts`:42-50. It justifies accepting a later minor only for
  additive changes, and that reasoning is now false twice over. ADR 0030's fourth
  lifecycle loosened the lifecycle enum at 2.2.0 without a bump, and this change
  loosens a required field.
- The honest statement: a minor is accepted because the schema is strict, so a
  document using anything this build does not know fails its parse and is refused,
  never misread. The refusal names the field rather than the version, because
  `parseSemanticBoard` runs the Zod parse (`index.ts`:28-31) before `versionIssues`
  (`family.ts`:211-224), and a same-major version passes that check anyway.
- Why not 3.0.0: a major is defined as moving or reinterpreting a field, and
  making `current` optional changes nothing for any document that carries one.
- Why bump at all, given the bump changes no older build's behaviour: the version
  line is the only place the contract history is written down, and the shelving
  change's omission from it is already a gap.
- Nothing tests this, and nothing should: `artifacts.test.ts` compares the
  generated artifacts with the live schema, and both move together.

**5. Correction: `adopt.ts`:39 is not the only adoption change.** `adopt.ts`:48
passes `board.current` as `was` into `designated(variant, becoming, was: string)`
(`adopt.ts`:130), so the signature widens to `was: string | undefined`. The
behaviour needs no change, because `undefined` matches no variant id. There are
two edits in total: the conditional spread of `from` at L39, and the widened
parameter.

**Considered and out of scope:**
- `transitions.ts`:366 (adopt) and :398 (shelve) also call `resolveVariant`.
  Both are safe, because `BoardAdoptInputSchema.variant` (`resolution.ts`:66) and
  the shelve input require a variant. There is one wording case: a user typing
  `--variant current` on a draft-only board gets `this board has no variant called
  "current"`. Criterion 2 should phrase that as "this board has no current
  variant".

**Agent-facing prose goes to criterion 7.** `skills/archboard/SKILL.md`:15 and
`skills/archboard/references/variants.md`:7, 14 and 125-126 all assume a current
variant exists: branch defaults from it, an unqualified edit lands on it, and
adopt demotes "the previous current". Criterion 3 gives an agent a way to create a
board with no current variant, and nothing in `skills/` yet tells an agent it can.
Criterion 7 owns that, alongside `skill-distribution/lib/schemas.ts`:34.

**Re-filed: `src/shared/semantic-board/tests/coherence.test.ts`:99 is NOT an
old-invariant test.** It asserts that a DANGLING designation (`current: "nope"`) is
refused, and that stays correct under the decision: absent is allowed, while
naming a variant the board lacks is not. Do not weaken it. Likewise
`branching.test.ts`:117, listed above, asserts that branching leaves exactly one
current variant on a board that had one. That is "branching designates nothing",
it stays true, and it should not be touched either. No test asserts that a
zero-current board is refused: the `family.ts`:152-157 "N variants are marked
current" issue has no test of its own. Criterion 2 therefore needs to add the
positive owner, a draft-only board parses and is written, rather than
remove any existing test.

**Corrected: `src/runtime/skill-evaluation/tests/reading-fixture.ts`:41-42.**
The audit said this makes every fixture board current-designated, which is
misleading. The fixture sets `current: variants[0]?.id` but defaults every
variant's lifecycle to `"draft"`, so it designates a current variant that is
marked draft. `designationIssues` would already refuse that combination. The
fixtures are evidently never re-parsed. This is harmless today but is criterion
8's to straighten.

**Regeneration:** both generated artifacts,
`skills/archboard/references/generated/semantic-board.schema.json` and
`docs/design/generated/command-contract-proof.md`, come from
`bun run generate:skill-artifacts`.

## The bare-address question: WHERE is settled, WHAT is the user's decision

This section replaces both earlier framings: the three candidates in the first
audit note, and the four in the review response. The question is what an address
that names no variant opens on a board with no current variant. Today
`resolveVariant(board, undefined)` answers two different questions with one
lookup:
- **Q1, semantic:** which variant is the implemented architecture? On a board with
  no current variant, the truthful answer is none. ADR 0031 is about this question.
- **Q2, addressing:** which variant is drawn when nobody said which?

### WHERE the default lives: settled by ADR 0031, not an option

Any default for Q2 lives in its own address resolution, separate from
`resolveVariant` and `currentVariant`. Both of those stay unchanged and keep
answering Q1.

The reason is `drill-target.ts`:42. It calls `resolveVariant(reading.board)` to
serve a link whose author explicitly wrote `kind: "current"`. A default placed
inside `resolveVariant` would turn `{kind: "no-current"}` into opening a draft,
which contradicts ADR 0023:111-112 and ADR 0031's own drill-down consequence.
The same holds for every other Q1 reader: adopt, shelve,
`semantic-board-context.ts`:252 and the eval outcome checks.

Whatever the policy below turns out to be, it applies only where the question is
"what do I draw":
- `semantic-renderer/board.ts`:182;
- the address grammar: `makeIdentity` / `parseBoardKey` in `board-address.ts`;
- `pane-registry.ts`:286, `pane-show-route.ts`:84 and
  `code-opener/lib/routes.ts`:133;
- `local-pictures.ts`:247-248 and `board-catalog/listing.ts`:107-111.

On a board that has a current variant, every policy opens it, exactly as today.

### Which variants count

Two things are settled, each checked against every path into the state it
depends on.

- **"Draft" means lifecycle `draft`.** A shelved variant is not a draft (CONTEXT.md,
  Shelved variant), so it never counts toward "the sole draft".
- **A board with no current variant has no historical one.** Only adoption writes
  `historical` (`adopt.ts`:134), and only onto the variant that was current. Only
  creation (`transitions.ts`:168) and adoption (`adopt.ts`:47) write `current`.
  Nothing removes it: shelve refuses the current variant, and adopt only moves the
  designation. So a board with no current variant was never adopted, and every
  variant on it is a draft or shelved.

**"The root draft" is NOT settled, and must be defined as part of the user's
decision.** A correction to the previous version of this note: it argued that
"whenever a draft exists, the root is a draft". That is false. `shelve.ts`:119-122
refuses to shelve only a variant with a DIRECT draft child. That protects a chain
of drafts that already exists, but it does not stop a draft being branched from a
variant that is already shelved. Branching checks no lifecycle
(`transitions.ts`:213-248), BRANCH_INSTEAD (`shelve.ts`:38-40) tells people to do
exactly that, and `shelving.test.ts`:278 tests it. Every step of this sequence is
allowed today on a board with no current variant:
1. Create root R as a draft.
2. Shelve R. No draft stands on it.
3. Branch D1 and D2 from R.

Drafts now exist, the root is shelved, and there are two drafts with no draft
ancestor. "The root draft" therefore needs a definition. The natural one is **a
draft with no draft ancestor**. Under it, one board can hold several root drafts,
and a board may have no root variant that is a draft at all.

Two residues belong to the user's decision:
- **The all-shelved board.** Everything proposed was let go and nothing was built.
  No policy below opens anything there, unless the user wants a bare address to
  open a shelved variant.
- **The shelved-root board.** The family's root was let go and later drafts were
  branched from it. This is the likelier of the two, because BRANCH_INSTEAD
  teaches it as the way to take a let-go proposal back up. Policies 1 and 4 treat
  it like any other board. Under policies 2 and 3 it is where "the root draft"
  can be several variants.

### WHAT the bare address opens: four policies, for the user

In each policy below, "refuse" means refusing with the candidates named, never
`no variant called ""`.

1. **The sole draft.** Open the one draft; when there are several, refuse.
   - *Case:* covers the commonest planning board (one draft, just created) with the
     least rule, and never picks between alternatives on the author's behalf.
   - *Cost:* stops opening anything as soon as a second draft is branched, so it
     needs policy 4's refusal behind it. What a bare address opens then changes
     the moment someone branches.
2. **The root draft**, defined as the draft with no draft ancestor. When several
   drafts have none (the shelved-root board), refuse.
   - *Case:* on a board whose root is still a draft, it is unique, and it stays the
     same as drafts are branched below it.
   - *Cost:* that stability holds only while the root stays a draft. Shelving the
     root and then branching from it changes the answer from one variant to a
     refusal. And while it holds, the root is the least interesting variant once
     alternatives have been branched, so a bare address opens the starting point
     rather than any proposal under discussion.
3. **The cascade:** the sole draft, else the unique root draft, else refuse.
   - *Case:* opens the obvious variant in the one-draft case, and still opens
     something on a many-draft board whose root is a draft.
   - *Cost:* it is not always defined: it refuses on a shelved-root board with
     several root drafts. What a bare address opens also depends on the board's
     shape, and it shifts when a draft is branched, shelved or adopted. That is
     tolerable, since `current` already moves under an unchanged address, but it
     is a second moving default for a reader to know about.

   For policies 2 and 3, a different tiebreak among several root drafts (the most
   recently created, say) would be a variant of the policy, and would need the
   user to name it. As written, both refuse.
4. **Refuse, and require a named variant.**
   - *Case:* the most explicit policy. It never opens something by default, in the
     spirit of ADR 0023:111-112, which refuses a silent fallback for links. It
     costs little beyond the entry points: `SemanticVariantBar.tsx`:67,
     `pane-reading.ts`:31 and `listing.ts`:33 already re-address everything as
     `board@<id>` after the first draw. Only a typed `pane show`, a catalogue
     row, a reconnect and a code-binding follow meet a bare address.
   - *Cost:* a draft-only board has no bare-name address, so opening it by name
     shows a refusal rather than the board. That is in tension with criterion 5,
     which asks that a person opening such a board see from the pane and the
     drawing that it is unbuilt.

**Common cost of policies 1-3:** they add a second lookup beside `resolveVariant`,
and every caller must choose between the two correctly. That is a new way to get
it wrong: a Q1 reader that picks up the address lookup would silently present a
draft as the implemented architecture. Policy 4 adds no second lookup, only
refusals worded for this case.

### The reviewer's recommendation, attributed

The round-1 reviewer recommended policy 3. Its argument:
- It is the only policy under which "a bare address opens something" and "asking
  which variant is implemented answers nothing" are both true.
- Policy 4 gives up the first, at the cost of criterion 5.
- It keeps `current` meaning exactly one thing, which is ADR 0031's thesis.
- It is cheap, because the bare address matters only at the handful of entry
  points listed under policy 4.

Qualification added in round 3: policy 3 is not always defined. It refuses on a
shelved-root board with several root drafts, so the first point holds everywhere
except there.

This is the reviewer's view, recorded here so it is not lost. It is not the plan's
choice. The user decides, and the decision gates the implementation slice.

**Re-check of the audit's other "never" claims, against every path into the state
they rely on (round 3):**
- **"Adopting on a board with no current variant is accepted as it stands."** The
  audit argued this only for the root draft, which has no predecessor. It also
  holds for a draft branched from a shelved variant. `unsettledAncestor`
  (`propagate.ts`:75-90) refuses only an ancestor holding a `reconciliation`.
  Shelving strips that standing (`letGo`, `shelve.ts`:146-148). A shelved variant
  never acquires one again, because only a draft follows its predecessor.
- **"`ALREADY_CURRENT` cannot trigger" and "`designated` demotes nothing"** both
  rest on `board.current` being absent. On a board with no current variant it is
  absent by definition, as the lifecycle facts above establish.
- **CONTEXT.md's "every variant on it is a draft or shelved"** rests on the
  no-historical fact above. That fact was checked against every writer of
  `historical` and `current`, and it holds.

**Regardless of which is chosen:** `pane-registry.ts`:286 must be fixed, because a
reconnecting pane currently loses its board silently instead of refusing visibly.
Every refusal on these paths must also say why, instead of `no variant called ""`.

**Also for criterion 8, confirmed by the review:**
- `outcomes-family.ts`:265 (`current-untouched`) passes vacuously on a board with
  no current variant.
- `reading.ts`:84 means every eval check that names no variant silently retargets
  on a draft-only board.

User decided 2026-09-23: the bare address takes the reviewer's policy 3, the cascade. On a board with a current variant it opens that variant, exactly as today. Otherwise it opens the sole draft; otherwise the unique root draft (a draft with no draft ancestor); otherwise it refuses and names the candidates. The default lives in its own address resolution, never inside resolveVariant or currentVariant, which keep answering which variant is implemented.

Implementation 2026-09-23, commits 525c9f19..923e60f1 on main.
- Bare address (cascade, the user's decision): addressedVariant(board, asked?) in src/shared/semantic-board opens the current variant, else the only draft with no draft ancestor (which covers a sole draft), else refuses and names the candidates. Used by the renderer, pane show and reconnect (stillThere, via the new statedVariant in engine/board), the code opener, walkthrough narration, store transitions that name no variant, and CLI inspect, compare, edit, branch and resolve. resolveVariant and currentVariant still answer only which variant is implemented (drill-down, adopt, shelve, the brief's account, eval outcome checks).
- #2: current is optional; designationIssues allows zero or one current variant, and a dangling designation is still refused. Schema is 2.4.0 with a content-keeping migration step (2.3.0 was already taken by authored order in 60bbb648). Artifacts regenerated. Positive owners: addressing.test.ts and planned-board.test.ts.
- #3: create takes "lifecycle": "draft" (default current).
- #4: adopting on a board with no current variant records no from and makes nothing historical, and the diagnostic says nothing was built before. --variant current on such a board is refused as having no current variant. Owned by the store test and tests/system/semantic-boards/variant-targeting.test.ts.
- #6: BINDING_PATH_MISSING judges a binding by the variant it is on and runs only over the current variant. A draft's binding is ahead of the code; the check applies once adoption makes the variant current. A third repair was added. Reasons are in ADR 0031; owned by bindings.test.ts.
- #7: SKILL.md 'Planning what nobody has built', plus variants/edit/authoring/create-architecture/propose-compare. The stated intent stands in for a source line. eval:skill check passes.
- #8: flask/sources are optional together (planning runs use an empty checkout, revision null). The rubric has a 'Planning runs' section. current-untouched and reading.ts no longer pass vacuously or retarget silently. reading-fixture builds coherent boards.
- #5 so far: the agent brief says nothing is built. The listing returns opens per board. The UI keys the bare row from opens, prefetches the opened variant by bare name, and the inspector reports the resolver's own reason. The visible 'nothing here is built' treatment in the pane and the drawing is pending the user's choice from rendered options.
Full gate on the branch: bun run check exit 0 (3459 module, 169 system, 8 repository, all serial-browser owners).
<!-- SECTION:NOTES:END -->
