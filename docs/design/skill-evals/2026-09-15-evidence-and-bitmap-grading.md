# Evidence checks and bitmap grading: hypotheses, and what is demonstrated

TASK-214 changed the consumer skill and the evaluation harness after the
human-run batch of 2026-09-14 (`.skill-evals/2026-09-14T13-50-10-617Z`,
corrected in [2026-09-14-batch-corrections.md](2026-09-14-batch-corrections.md)).
This note keeps the two things apart that a later report must not merge:
what that batch showed, and what the changes are hoped to do.

## What the batch showed (evidence)

- Authors read the correct guidance and the relevant source and still
  authored false relationships (S00, S14: sibling calls drawn as a chain, a
  container drawn as a receiver), omitted external dependencies the request
  named (S14), bound nodes to the file that invokes a function rather than the
  one that implements it (S00, S14), selected views with the wrong semantics
  after reading the views reference (all three candidate S12 runs), and
  patched the vault file after an unsupported operation was refused (five S11
  runs across both arms).
- No run of any scenario had a picture the grader could look at: the harness
  drew SVGs only where a `render-ok` check asked, five scenarios drew nothing,
  and the two sequence scenarios drew the architecture grammar rather than the
  exchange the request asked for. Readability was scored from names and
  views, not from a diagram anybody saw.

These are evidence of failure mechanisms. They are not evidence that any
particular change to the skill improves success.

## What changed (hypotheses)

The consumer skill (`skills/archboard`) now:

1. requires a source-evidence record (caller, receiver, kind, location) for
   every relationship and sequence step before writing, and an audit of the
   saved answer against that record; it shows sibling calls against a
   fictitious chain;
2. asks the author to consider inbound callers, external libraries and
   services, callbacks and plugins, and persistence or messaging boundaries,
   and to include only what the board's question needs;
3. binds a part only to the implementation owner of its stated
   responsibility, never to an import, registration or invocation site, and
   leaves an unavailable implementation unbound;
4. translates a request into checks before writing (board and version,
   target variant, ids and fields to preserve, exact view selectors), keeps
   explicit-edge isolation distinct from node-region inclusion and
   proposal-only edits distinct from current-state edits, and verifies the
   saved answer against those checks;
5. states near the top that the CLI is the only way a board is written, that
   a refusal is repaired from evidence and not retried on hope, and that an
   unsatisfiable request is reported with valid state preserved;
6. justifies every semantic claim in its examples from inspected source,
   drops the fixed repeat count, and describes visual verification as opening
   a picture and checking the intended view, labels, clipping, relationships
   and sequence details.

The hypothesis is that these raise semantic success (every expected feature
passing under source-grounded grading) more than prose or token economy
would, at a token cost the user accepts. The harness now takes a native-scale
capture of every declared diagram in every run, both arms, every repetition,
and every grading prompt, including resumptions, receives the main images
and all native detail tiles as mandatory image attachments; the hypothesis there is that a
grader that looked at the picture grades readability, clipping, overlap,
endpoints and sequence legibility that a text reading cannot see. The harness
records image-delivery evidence only after a successful call, binding the
supplied image IDs and SHA-256 digests to the exact filed verdict. The grader
also supplies one image-grounded observation per capture. Reports verify the
receipt against the saved bytes and fail closed for missing, failed, stale or
unobserved captures and absent native detail tiles. Delivery is verifiable;
the observations remain the grader’s judgment. Visual failures prevent
success and efficiency claims; incomplete visuals leave quality unassessed.

## What is demonstrated (nothing yet)

No model has run on the changed inputs. The next human-run batch runs the
corrected inputs and the same CLI in both arms, with the frozen baseline
skill repinned on that CLI, and its report is the first measurement. Until
then every statement above about improvement is a hypothesis, and the
comparison to read is success and semantic/visual quality first, tokens
second. Fast owners hold the implementation to its contract without any
model run: `src/runtime/skill-evaluation/tests` (captures, blinding, visual
standing, suite shape), `src/runtime/semantic-rasterizer/tests` and
`tests/system/semantic-boards/rasterize.test.ts` (the pictures themselves),
skill synchronization and `bun run check`.
