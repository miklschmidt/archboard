#!/usr/bin/env bun

// There is one representation of a label, and this is the proof.
//
// A label is a text element bound to a shape. It used to be that and a `label`
// seed on the shape and a conversion between them running on every delivery,
// and the count grew by one on every trip through the browser, forever: a board
// of 41 drawn elements reached 284 and five arrow labels were duplicated 42
// times each (TASK-024). Renaming brought the old name back (TASK-028) and
// clearing brought the old text back (TASK-029).
//
// Under ADR 0015 the conversion happens once, at the write boundary, and
// nothing converts on the way out. So a label is expanded when it is written
// and never again, and the loop that grew it cannot turn.
//
// The seed itself is gone from the board (TASK-073). It is still how an agent
// says what a label reads, and it is read once, on the way in; what the board
// keeps is the text element it became. That is what makes TASK-028 and
// TASK-029 impossible rather than fixed. Both had needed a rule for which of
// two spellings won, and the two runs below marked "not luck" put the second
// spelling back to show that each rule was covering for it.
//
// WHAT IS MODELLED AND WHY. The real write boundary is used — this file's
// `boardOf` calls `expandElements`, the one converter, exactly as
// `src/server.ts` does. What is modelled is the *pane*: the baseline it
// reports against, the human typing into a text element, and Excalidraw's
// deletion of a bound text somebody emptied. Those need a DOM, and the loop
// they close is the one that has to be run to exhaustion rather than looked at.
//
// The model stays hostile on purpose. `expand()` below is Excalidraw's
// `convertToExcalidrawElements` in the one respect that mattered — it mints a
// fresh text element every time it sees a seed, whether or not one exists —
// and the first check runs it on the delivery path to show the count still
// explodes there. That is what "a conversion on read is a second converter"
// costs, kept in front of anyone who reads this file.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDoing } from './lib/doing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  boundTextsByContainer,
  planLabelRepair,
  labelAnchorOf,
  boundTextPlacement,
  recentreBoundTexts,
  boundTextDrift,
  rescueDriftedBoundTexts,
  labelTextIdFor
} = await import(join(__dirname, '..', 'src', 'core', 'labels.ts'));
const { isBlockId } = await import(join(__dirname, '..', 'src', 'core', 'ids.ts'));
const { expandElements, expandForBoard } =
  await import(join(__dirname, '..', 'src', 'core', 'expand-elements.ts'));
const { applyElementInput } =
  await import(join(__dirname, '..', 'src', 'core', 'apply-element-input.ts'));

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

// ─── The three parties ───────────────────────────────────────

// The real converter names what it mints with a 21-character nanoid. The
// length is modelled because it is load-bearing: an id that long cannot be an
// Obsidian block reference, so the note writer used to rename it — which is
// how a text element got renamed out from under an open editor (TASK-069).
const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const freshId = () =>
  Array.from({ length: 21 }, () => NANOID_ALPHABET[Math.floor(Math.random() * NANOID_ALPHABET.length)]).join('');

/**
 * Excalidraw's convertToExcalidrawElements, in the one respect that matters:
 * a `label` on a shape or arrow becomes a *new* text element every call, with
 * an id it invents, and the container gains a reference to it. It does not
 * look at whether the container already has one — that is the whole bug.
 */
function expand(elements) {
  const out = [];
  for (const element of elements) {
    const seed = element.type === 'text' ? undefined : (element.label?.text ?? element.text);
    // `if (element.label?.text)` is the real converter's own guard: a label
    // that is absent, null or empty is not expanded into anything.
    if (typeof seed !== 'string' || seed === '') {
      out.push(element);
      continue;
    }
    const id = freshId();
    out.push({
      ...element,
      boundElements: [...(element.boundElements ?? []), { id, type: 'text' }]
    });
    out.push({
      id,
      type: 'text',
      containerId: element.id,
      text: seed,
      // The real converter measures and seeds what it mints; both are fresh
      // every call, which is what makes an unnecessary re-expansion visible as
      // churn rather than as nothing.
      seed: Math.floor(Math.random() * 1e6),
      width: seed.length * 10
    });
  }
  return out;
}

/**
 * What the pane used to do after converting: once a container had its text
 * element, the seed that produced it was dropped from the scene. Kept here
 * because the unfixed model needs it — a seed the pane held on to would be
 * reported straight back and the loop would be a different loop than the one
 * TASK-024 was.
 */
function dropSpentSeeds(scene) {
  const labelled = boundTextsByContainer(scene);
  return scene.map((element) => {
    if (!labelled.has(element.id) || !('label' in element)) return element;
    const { label: _label, ...rest } = element;
    return rest;
  });
}

/** frontend/src/canvas/changes.ts: a pane reports only what its baseline lacks. */
function fingerprint(element) {
  return JSON.stringify(Object.keys(element).sort().map((key) => [key, element[key]]));
}

/**
 * Somebody clears a label. Excalidraw does not leave an empty text element
 * behind: a bound text submitted blank is marked `isDeleted` and unbound from
 * its container (App.handleTextWysiwyg -> fixBindingsAfterDeletion). So the
 * scene keeps the deleted element — with its `containerId` — while the live
 * board has neither the text nor the binding.
 */
function blank(scene, empties) {
  const doomed = new Set();
  for (const element of scene) {
    if (element.type === 'text' && empties[element.containerId]) doomed.add(element.id);
  }
  if (doomed.size === 0) return scene;
  return scene.map((element) => {
    if (doomed.has(element.id)) return { ...element, text: '', isDeleted: true };
    if (!Array.isArray(element.boundElements)) return element;
    if (!element.boundElements.some((ref) => doomed.has(ref.id))) return element;
    return { ...element, boundElements: element.boundElements.filter((ref) => !doomed.has(ref.id)) };
  });
}

/**
 * frontend/src/canvas/changes.ts: what a pane says, which is a delta and
 * nothing else.
 *
 * It used to say more. A reported bound text carried a statement of what its
 * container's seed now read, and a deleted one carried the striking out of
 * that seed, because the seed was stored and was what the next write expanded
 * (`labelStatements`, `labelClearances`). Both are gone with the seed
 * (TASK-073), and this function is the shape of that: a rename is a text
 * upsert, an emptying is a delete, and neither needs a second sentence.
 *
 * A report is built from the live board — deleted elements are never upserted
 * and never enter the baseline — but it is computed against the scene
 * *including* them, because that is the only place the fact of a deletion is
 * recorded.
 */
function reportOf(scene, baseline) {
  const alive = scene.filter((element) => !element.isDeleted);
  const upserts = alive
    .filter((element) => baseline.get(element.id) !== fingerprint(element))
    .map((element) => ({ ...element }));
  const kept = new Set(alive.map((element) => element.id));
  const deletes = [...baseline.keys()].filter((id) => !kept.has(id));
  return { upserts, deletes };
}

/** POST /api/elements/changes: upserts are *merged*, so stored fields survive. */
function applyUpserts(store, upserts) {
  for (const upsert of upserts) {
    store.set(upsert.id, { ...(store.get(upsert.id) ?? {}), ...upsert });
  }
}

/**
 * One full round trip: the server broadcasts, the pane renders what it got, a
 * human may type into it, and it reports back anything it had not seen.
 *
 * `contain` is the arrangement under test. True is ADR 0015: the board already
 * holds the text elements, so a delivery is handed over as it stands and there
 * is nothing to convert. False is what this replaced — a second converter, run
 * on every delivery, minting a text element for every seed it sees.
 */
function cycle(store, baseline, { contain, types, empties }) {
  const broadcast = [...store.values()];
  const scene = contain ? broadcast : dropSpentSeeds(expand(broadcast));

  // Somebody at the board retypes a label. It lands in the text element and
  // nowhere else — Excalidraw has no `label`, and the container has nothing new
  // to say — which is exactly why the seed on the server goes stale.
  const typed = types
    ? scene.map((element) => {
        const wanted = element.type === 'text' ? types[element.containerId] : undefined;
        return wanted === undefined ? element : { ...element, text: wanted };
      })
    : scene;

  // Or clears one, which is a deletion rather than an edit.
  const edited = empties ? blank(typed, empties) : typed;

  const { upserts, deletes } = reportOf(edited, baseline);
  baseline.clear();
  // A pane agrees only what is on the board; a deleted element is news it has
  // already delivered, so the next diff must not keep claiming it.
  for (const element of edited) {
    if (!element.isDeleted) baseline.set(element.id, fingerprint(element));
  }
  applyUpserts(store, upserts);
  for (const id of deletes) store.delete(id);
  return { scene: edited, upserts, deletes };
}

/**
 * An agent's write, through the code that performs one.
 *
 * `applyElementInput` is the write conversion entry `src/server.ts` calls.
 * The HTTP read, persistence and broadcast stay outside it, so a Map is all
 * this check needs to exercise the real stage order. The text elements are on
 * the board before any pane has seen it, which is the change everything below
 * turns on — a headless board used to carry labels that existed only as seeds
 * and only became elements when a browser happened to render one.
 *
 * `keepSeed` is the revert. Until stage 6 the converted element went to the
 * board still carrying the `label` an agent wrote, so one label was two facts
 * and the second one went stale the moment somebody at the board retyped the
 * first. Turning it on here is how the two runs below reproduce TASK-028 and
 * TASK-029; with it off, which is the code as it stands, neither has anything
 * to revert to.
 */
function write(store, statements, { keepSeed = false } = {}) {
  applyElementInput(store, { upserts: statements, origin: 'agent' });
  if (keepSeed) {
    for (const statement of statements) {
      const seed = seedOf(statement);
      if (seed !== undefined) {
        store.set(statement.id, { ...store.get(statement.id), label: { text: seed } });
      }
    }
  }
  return store;
}

function boardOf(elements, options) {
  return write(new Map(), elements, options);
}

/** What an element's `label`/`text` claims its label reads, if anything. */
function seedOf(element) {
  if (element.type === 'text') return undefined;
  if (typeof element.label?.text === 'string') return element.label.text;
  if (typeof element.text === 'string') return element.text;
  return undefined;
}

/** Every element on a board still carrying a seed, which must be none. */
function seeded(store) {
  return [...store.values()].filter((element) => seedOf(element) !== undefined).map((element) => element.id);
}

function worstLabelCount(elements) {
  const counts = [...boundTextsByContainer(elements).values()].map((ids) => ids.length);
  return counts.length === 0 ? 0 : Math.max(...counts);
}

const drawn = () => [
  { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } },
  { id: 'gw', type: 'rectangle', x: 400, y: 0, width: 200, height: 80, label: { text: 'Gateway' } },
  {
    id: 'wire',
    type: 'arrow',
    x: 200,
    y: 40,
    width: 200,
    height: 0,
    points: [[0, 0], [200, 0]],
    start: { id: 'svc' },
    end: { id: 'gw' },
    label: { text: 'HTTP' }
  }
];

const CYCLES = 25;

// --- one input entry owns the whole order ---------------------------------

{
  const board = new Map();
  const applied = applyElementInput(board, {
    origin: 'agent',
    upserts: [
      { type: 'rectangle', x: 0, y: 0, width: 200, height: 80, text: 'Orders' },
      { type: 'text', x: 0, y: 120, text: 'unsized note' }
    ]
  });
  const box = applied.named[0];
  const note = applied.named[1];
  const label = [...board.values()].find((element) => element.containerId === box.id);

  assert(applied.named.length === 2, 'the entry did not return one board-shape element per input');
  assert(isBlockId(box.id) && isBlockId(note.id) && isBlockId(label?.id),
    'the entry let an unminted input reach the board without block-safe ids');
  assert(!('text' in box) && !('label' in box),
    'the entry left a shape name in an input spelling after conversion');
  assert(label?.text === 'Orders' && typeof label.width === 'number' && label.width > 0,
    'the entry did not spend and measure the shape label');
  assert(typeof note.width === 'number' && note.width > 0 && typeof note.height === 'number',
    'the entry did not measure an unsized standalone text element');

  const beforeVersion = box.version;
  const renamed = applyElementInput(board, {
    origin: 'agent',
    upserts: [{ id: box.id, text: 'Ledger' }]
  });
  const heldBox = board.get(box.id);
  const heldLabel = [...board.values()].find((element) => element.containerId === box.id);
  assert(heldBox.version === beforeVersion + 1 && typeof heldBox.updatedAt === 'string',
    'the entry did not bump the updated element version and updatedAt');
  assert(heldLabel.text === 'Ledger' && renamed.updated.some((element) => element.id === heldLabel.id),
    'the entry did not restate the measured label in its settled delta');
}

// --- one converter, two entry points ----------------------------------------
//
// `expandElements` and `expandForBoard` are both exported from
// `expand-elements.ts`, and TASK-089 went through the codebase looking for two
// implementations of one thing that were meant to agree. This pair is not that:
// `expandForBoard` does none of the converting, it squares a partial write's
// label references against the board and then calls the other one.
//
// Written down in both doc comments, and asserted here, because a comment
// saying "these cannot diverge" is worth exactly as much as whatever stops
// them. Given a board that adds nothing, the wrapper's answer is the
// converter's answer, field for field.
{
  const written = [
    { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } },
    { id: 'wire', type: 'arrow', x: 0, y: 0, points: [[0, 0], [300, 0]], label: { text: 'HTTP' } }
  ];
  const wrapped = expandForBoard(written.map((el) => ({ ...el })), new Map());
  const converted = expandElements(written.map((el) => ({ ...el })), { forStore: true });
  const shape = (elements) => JSON.stringify(
    elements.map((el) => Object.fromEntries(
      Object.entries(el).filter(([key]) => !['seed', 'versionNonce', 'updated'].includes(key))
    ))
  );
  assert(shape(wrapped) === shape(converted),
    'the two entry points into the one conversion gave different answers for the same elements, ' +
    'which is the divergence ADR 0015 exists to prevent');
}

// --- the converter's constants, one at a time -------------------------------
//
// `docs/design/server-is-the-truth.md` §1C listed fourteen fields on which our
// converter and Excalidraw's `convertToExcalidrawElements` produced different
// documents, and stage 5 was to correct ours to theirs. Twelve constants, an
// id scheme and two measured fields.
//
// That table compares two converters, and the second one is now deleted, so
// matching it was never the property worth having. The property is the round
// trip: a document we persist, read back and render is the document we saved.
// `scripts/check-fixed-point.mjs` asserts that against a real browser and
// `scripts/check-live-session.mjs` asserts it holds across 42 cycles of
// editing. Both report zero.
//
// Four of the twelve were not adopted, and only one of the four mattered: an
// absent `strokeColor` is a missing field rather than a style, and an element
// without one is malformed. The other three — a rectangle's corner radius, a
// freedraw's stroke width, half a stroke width off an arrow's endpoints — are
// arbitrary, and the round trip is indifferent to them. They are pinned below
// so that changing one is deliberate, not because any value is the right one.
//
// So each row below says which of the two it is: a default read out of
// Excalidraw's own `DEFAULT_ELEMENT_PROPS` and `AppState`, or a field the
// renderer insists on.

{
  const one = (element) => expandElements([element], { deterministic: true });
  const only = (element, type) => one(element).find((el) => el.type === type);
  const box = { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 200, height: 100 };

  // 1-3. Excalifont at 20, for a standalone text and for either kind of label.
  // `currentItemFontFamily` is Excalifont and `currentItemFontSize` is 20, so
  // this is what a human typing on the board gets. Virgil is deprecated in
  // Excalidraw, and 16 and 14 came from nowhere in particular.
  const standalone = only({ id: 't1', type: 'text', x: 0, y: 0, text: 'caption' }, 'text');
  assert(standalone.fontFamily === 5, `a standalone text is fontFamily ${standalone.fontFamily}, not Excalifont`);
  assert(standalone.fontSize === 20, `a standalone text is fontSize ${standalone.fontSize}, not 20`);
  const shapeLabel = only({ ...box, label: { text: 'AuthService' } }, 'text');
  assert(shapeLabel.fontFamily === 5, `a shape's label is fontFamily ${shapeLabel.fontFamily}, not Excalifont`);
  assert(shapeLabel.fontSize === 20, `a shape's label is fontSize ${shapeLabel.fontSize}, not 20`);
  const arrowLabel = only(
    { id: 'a1', type: 'arrow', x: 0, y: 0, points: [[0, 0], [100, 0]], label: { text: 'gRPC' } }, 'text');
  assert(arrowLabel.fontSize === 20, `an arrow's label is fontSize ${arrowLabel.fontSize}, not 20`);
  assert(arrowLabel.fontFamily === 5, `an arrow's label is fontFamily ${arrowLabel.fontFamily}, not Excalifont`);

  // 4. A bound text's strokeWidth. `DEFAULT_ELEMENT_PROPS.strokeWidth` is 2,
  // and the bound text was the one element written at 1.
  assert(shapeLabel.strokeWidth === 2, `a bound text is strokeWidth ${shapeLabel.strokeWidth}, not 2`);

  // 5-6. A standalone text is left-aligned and top-aligned — `currentItemTextAlign`
  // is `left` and the vertical default is `top`. A bound one is centred both
  // ways, which is how Excalidraw draws a label inside a box.
  assert(standalone.textAlign === 'left', `a standalone text is ${standalone.textAlign}-aligned, not left`);
  assert(standalone.verticalAlign === 'top', `a standalone text is ${standalone.verticalAlign}, not top`);
  assert(shapeLabel.textAlign === 'center' && shapeLabel.verticalAlign === 'middle',
    'a bound text is not centred in its container');

  // 7. Arbitrary. The round trip does not care what a corner radius is. Pinned
  // so that changing it is a decision rather than a drift nobody noticed.
  assert(JSON.stringify(only(box, 'rectangle').roundness) === '{"type":3}',
    'a rectangle is not rounded, so it will not match one a human drew');

  // 8. Arbitrary, like the corner radius, and pinned for the same reason.
  //
  // 9. Not arbitrary. "Absent" is not a value a stroke can have: every element
  // Excalidraw renders carries a stroke colour, so writing one without it is
  // writing a malformed element and leaving the renderer to invent the rest.
  // That is the "one document, two answers" shape ADR 0015 exists to remove,
  // so what matters here is that the field is there at all.
  const stroke = only({ id: 'f1', type: 'freedraw', x: 0, y: 0, points: [[0, 0], [10, 10]] }, 'freedraw');
  assert(stroke.strokeWidth === 2, `a freedraw is strokeWidth ${stroke.strokeWidth}, not the default 2`);
  assert(stroke.strokeColor === '#1e1e1e', `a freedraw is ${stroke.strokeColor}, not the default stroke colour`);

  // 10. `elbowed` belongs to an arrow. A line carrying it is carrying a field
  // Excalidraw's line type does not have.
  const line = only({ id: 'l1', type: 'line', x: 0, y: 0, points: [[0, 0], [100, 0]] }, 'line');
  assert(!('elbowed' in line), 'a line was given an `elbowed` field');
  assert(only({ id: 'a2', type: 'arrow', x: 0, y: 0, points: [[0, 0], [100, 0]] }, 'arrow').elbowed === false,
    'an arrow was not told whether it is elbowed');

  // 11. A freedraw carries a stroke's own record of how it was drawn. A
  // hand-drawn one always has these three; one an agent wrote had none, and
  // the browser filled them in on delivery so the note never learned.
  assert(stroke.lastCommittedPoint === null, 'a freedraw has no lastCommittedPoint');
  assert(Array.isArray(stroke.pressures), 'a freedraw has no pressures');
  assert(stroke.simulatePressure === true, 'a freedraw does not say its pressure is simulated');

  // 12. Arbitrary. The inset kept an arrowhead off a shape's border for a
  // converter that no longer exists; a bound arrow's path comes from its
  // binding's own `focus` and `gap`, and the conversion is not what applies
  // them. The fixed-point check reports nothing on these points either way.
  const arrow = only({
    id: 'a3', type: 'arrow', x: 0, y: 0, points: [[0, 0], [84, 0]],
    startBinding: { elementId: 'r1', focus: 0, gap: 4 }
  }, 'arrow');
  assert(JSON.stringify(arrow.points) === '[[0,0],[84,0]]',
    `a bound arrow's path was rewritten to ${JSON.stringify(arrow.points)}`);

  // And the id scheme, which is the thirteenth row: a label is named from its
  // container, in the shape every id is minted in, so nothing renames it.
  assert(shapeLabel.id === labelTextIdFor('r1'),
    `a label is named ${shapeLabel.id}, not the id derived from its container`);
  assert(isBlockId(shapeLabel.id), `a label's id is not a block id (${shapeLabel.id})`);

  // The two measured rows. Only one of them is measured: Excalidraw's
  // getTextHeight is fontSize x lineHeight x lineCount and touches no glyphs.
  assert(shapeLabel.width === 114.5,
    `"AuthService" at Excalifont 20 is ${shapeLabel.width} wide, and Chrome says 114.5`);
  assert(shapeLabel.height === 25, `and ${shapeLabel.height} tall, not 20 x 1.25`);
  assert(shapeLabel.x === 0 + (200 - 114.5) / 2 && shapeLabel.y === 0 + (100 - 25) / 2,
    `a label sits at ${shapeLabel.x},${shapeLabel.y} and its container centres it elsewhere`);

  // `index` is the one field a render did rewrite, because `a${n}` stops
  // increasing at ten: `a10` sorts before `a2`. A board of twelve came back
  // with five indices repaired.
  const twelve = expandElements(
    Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, type: 'rectangle', x: i * 10, y: 0, width: 10, height: 10 })),
    { deterministic: true });
  const indices = twelve.map((el) => el.index);
  assert(indices.every((value, i) => i === 0 || indices[i - 1] < value),
    `the indices of a twelve-element board do not increase: ${indices.join(' ')}`);
}

// --- the model reproduces the bug when both halves are put back -------------
//
// Without this the check could pass because the model is toothless rather than
// because the fix works. Both halves are needed to turn the loop, which is the
// clearest statement of why either one alone would have been enough to stop
// it: the board has to keep the seed, and something has to expand a seed on
// the way out. `keepSeed` is stage 5's board, `contain: false` is stage 4's
// pane, and together they are TASK-024.

{
  const store = boardOf(drawn(), { keepSeed: true });
  const baseline = new Map();
  for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: false });
  const elements = [...store.values()];
  assert(
    worstLabelCount(elements) > CYCLES / 2,
    `unfixed model did not reproduce the loop (worst container has ${worstLabelCount(elements)} bound texts)`
  );
  assert(
    elements.length > 3 + 3 * (CYCLES / 2),
    `unfixed model did not grow (${elements.length} elements after ${CYCLES} cycles)`
  );
}

// --- with containment, a label is grown exactly once ------------------------

{
  const store = boardOf(drawn());
  const baseline = new Map();
  const sizes = [];
  let reports = 0;
  for (let i = 0; i < CYCLES; i++) {
    const { upserts } = cycle(store, baseline, { contain: true });
    sizes.push(store.size);
    // Cycle 0 is the pane meeting the board for the first time and agreeing
    // every element on it. After that a settled board is silent.
    if (i > 0 && upserts.length > 0) reports += 1;
  }
  const elements = [...store.values()];
  const labels = boundTextsByContainer(elements);

  assert(store.size === 6, `expected 3 drawn + 3 labels, got ${store.size} after ${CYCLES} cycles`);
  assert(new Set(sizes).size === 1, `board size drifted across cycles: ${sizes.join(',')}`);
  assert(labels.get('svc')?.length === 1, `labelled shape has ${labels.get('svc')?.length} bound texts`);
  assert(labels.get('wire')?.length === 1, `labelled arrow has ${labels.get('wire')?.length} bound texts`);
  assert(reports === 0, `a settled board kept reporting changes on ${reports} of ${CYCLES} cycles`);

  const arrow = store.get('wire');
  assert(JSON.stringify(arrow.points) === '[[0,0],[192,0]]',
    `the input refs did not route the arrow to the two shapes: ${JSON.stringify(arrow.points)}`);
  assert(arrow.x === 204 && arrow.height === 0 && arrow.width === 192,
    `the routed arrow geometry is ${arrow.x}, ${arrow.width}x${arrow.height}, not 204, 192x0`);
  assert(
    arrow.boundElements.filter((ref) => ref.type === 'text').length === 1,
    'arrow accumulated more than one bound-text reference'
  );

  const texts = elements.filter((element) => element.type === 'text');
  assert(texts.length === 3, `expected 3 text elements, got ${texts.length}`);
  assert(
    texts.map((t) => t.text).sort().join('|') === 'AuthService|Gateway|HTTP',
    `label text was lost: ${texts.map((t) => t.text).join('|')}`
  );

  // And the label is spelled once. The seed said what to draw, the conversion
  // drew it, and the board keeps the drawing and not the instruction — which
  // is the whole of TASK-073, because two spellings needed a rule for which
  // one wins and every version of that rule was a bug.
  assert(seeded(store).length === 0, `the board kept a label seed on ${seeded(store).join(', ')}`);
}

// --- fifty writes and fifty reads of one labelled arrow ---------------------
//
// TASK-024 was an arrow, and it took many round trips to get where it got: one
// arrow carrying 42 copies of its own name and a stored height of
// 0.9999999999999716, which is why it looked like arrows deleting themselves.
// A three-cycle check would have watched that happen and called it fine, so
// this one alternates an agent write with a delivery fifty times and watches
// the count on every pass rather than at the end.

{
  const store = boardOf([{
    id: 'wire', type: 'arrow', x: 0, y: 0, width: 200, height: 0,
    points: [[0, 0], [200, 0]], label: { text: 'HTTP' }
  }]);
  const baseline = new Map();
  let worst = 0;
  let biggest = store.size;
  for (let i = 0; i < 50; i++) {
    // Moving it is what an agent does most, and it is what re-routed the arrow
    // and re-measured the label every time round.
    write(store, [{ id: 'wire', x: i }]);
    cycle(store, baseline, { contain: true });
    worst = Math.max(worst, worstLabelCount([...store.values()]));
    biggest = Math.max(biggest, store.size);
  }

  assert(worst === 1, `fifty write-and-read cycles took one arrow's label to ${worst} bound texts`);
  assert(biggest === 2, `fifty cycles grew a two-element board to ${biggest}`);
  const label = boundTextsByContainer([...store.values()]).get('wire')[0];
  assert(store.get(label).text === 'HTTP', `the label read ${JSON.stringify(store.get(label).text)} after fifty cycles`);
  assert(store.get('wire').height === 0, `the arrow collapsed to a height of ${store.get('wire').height}`);
  assert(seeded(store).length === 0, `fifty cycles left a seed on ${seeded(store).join(', ')}`);
}

// --- a label is named here, not by the converter (TASK-069) -----------------
//
// The converter names what it mints, and what it mints is 21 characters, which
// no Obsidian block reference can hold. Under ADR 0015 the note is the board,
// so the note writer's rename of that id is what the browser gets back — and a
// text element renamed under an open editor silently discards what is typed
// into it. So the id is decided before the converter runs, in the shape every
// id is minted in, and it does not move afterwards.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  const seen = [];
  for (let i = 0; i < CYCLES; i++) {
    cycle(store, baseline, { contain: true });
    seen.push(boundTextsByContainer([...store.values()]).get('svc')?.[0]);
  }

  const labels = boundTextsByContainer([...store.values()]);
  const stray = ['svc', 'gw', 'wire']
    .map((container) => labels.get(container)?.[0])
    .filter((id) => !isBlockId(id));
  assert(stray.length === 0, `a label kept an id the note writer would rename: ${stray.join(', ')}`);

  assert(
    labels.get('svc')?.[0] === labelTextIdFor('svc'),
    `the shape's label is ${labels.get('svc')?.[0]}, not the id derived from its container`
  );
  assert(new Set(seen).size === 1, `the label's id moved across cycles: ${[...new Set(seen)].join(' -> ')}`);

  // And the rename path keeps it: the label still answers to the same name
  // after its text changes.
  write(store, [{ id: 'svc', label: { text: 'IdentityService' } }]);
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  assert(
    boundTextsByContainer([...store.values()]).get('svc')?.[0] === seen[0],
    'renaming a label renamed the element carrying it'
  );
}

{
  // The id is derived from the container, so a label cleared and written again
  // must not be handed the cleared element's name back — the struck-out element
  // is still in the document, and two elements cannot share a name.
  //
  // This is the one thing stage 2 put into `adoptReusedLabelIds` that had to
  // survive its deletion. It did, by moving to where the name is chosen: the
  // converter asks `labelTextIdFor` for a name nothing in the document holds,
  // deleted elements included.
  const written = expandElements([
    { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } },
    { id: labelTextIdFor('svc'), type: 'text', containerId: 'svc', text: '', isDeleted: true }
  ], { forStore: true });

  const fresh = written.find((element) => element.type === 'text' && !element.isDeleted);
  assert(fresh !== undefined, 'a label with no live text element was not expanded');
  assert(fresh.id !== labelTextIdFor('svc'), 'a re-expanded label took the cleared element’s name');
  assert(isBlockId(fresh.id), `the salted name is not a block id (${fresh.id})`);

  const ids = written.map((element) => element.id);
  assert(new Set(ids).size === ids.length, `expansion produced a duplicate id: ${ids.join(', ')}`);
  assert(
    written.some((element) => element.isDeleted && element.id === labelTextIdFor('svc')),
    'the cleared label was renamed onto the new one'
  );

  // A label that says nothing is not expanded, so there is nothing to name.
  const bare = expandElements(
    [{ id: 'bare', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }], { forStore: true });
  assert(bare.length === 1, 'an unlabelled shape was given a label');
}

// --- renaming still renames, and renames the same element -------------------
//
// The cheap way to stop the duplication would be to make an existing bound text
// untouchable, which stops labels changing at all. This is the check that says
// no.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const before = boundTextsByContainer([...store.values()]);
  const shapeLabel = before.get('svc')[0];
  const arrowLabel = before.get('wire')[0];

  // What `update <id> --set '{"text": ...}'` leaves on the server.
  write(store, [{ id: 'svc', label: { text: 'IdentityService' } }]);
  write(store, [{ id: 'wire', label: { text: 'gRPC' } }]);
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const after = boundTextsByContainer([...store.values()]);
  assert(after.get('svc')?.length === 1, `renaming a shape left ${after.get('svc')?.length} labels`);
  assert(after.get('wire')?.length === 1, `renaming an arrow left ${after.get('wire')?.length} labels`);
  assert(after.get('svc')[0] === shapeLabel, 'a renamed shape label became a different element');
  assert(after.get('wire')[0] === arrowLabel, 'a renamed arrow label became a different element');
  assert(store.get(shapeLabel).text === 'IdentityService', `shape label reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(store.get(arrowLabel).text === 'gRPC', `arrow label reads ${JSON.stringify(store.get(arrowLabel).text)}`);
  assert(store.size === 6, `renaming changed the element count to ${store.size}`);
  assert(seeded(store).length === 0, `renaming left a seed on ${seeded(store).join(', ')}`);
}

// --- a human retyping a label keeps it ---------------------------------------
//
// The other direction, and the one that used to need a rule. A person retypes
// a box on the board: the words land in the text element, and the seed on the
// server still said the old name. The seed was what the next write to that
// container expanded, so the board wrote their edit back out from under them
// (TASK-028). There is no seed now, so there is nothing to lose to.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const before = boundTextsByContainer([...store.values()]);
  const shapeLabel = before.get('svc')[0];
  const arrowLabel = before.get('wire')[0];

  cycle(store, baseline, { contain: true, types: { svc: 'Ledger', wire: 'AMQP' } });
  for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });

  const after = boundTextsByContainer([...store.values()]);
  assert(store.get(shapeLabel).text === 'Ledger', `a retyped shape label reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(store.get(arrowLabel).text === 'AMQP', `a retyped arrow label reads ${JSON.stringify(store.get(arrowLabel).text)}`);
  assert(seeded(store).length === 0, `retyping left a seed to revert to on ${seeded(store).join(', ')}`);
  assert(store.size === 6, `retyping a label changed the element count to ${store.size}`);
  assert(after.get('svc')?.length === 1, `retyping left ${after.get('svc')?.length} labels on the shape`);
  assert(after.get('wire')?.length === 1, `retyping left ${after.get('wire')?.length} labels on the arrow`);
  assert(after.get('svc')[0] === shapeLabel, 'a retyped shape label became a different element');
  assert(after.get('wire')[0] === arrowLabel, 'a retyped arrow label became a different element');

  // A page reload is the pass that showed the revert most plainly: the whole
  // board comes back from the server at once, so every seed is delivered again.
  const reloaded = new Map();
  cycle(store, reloaded, { contain: true });
  assert(store.get(shapeLabel).text === 'Ledger', `reloading reverted the shape label to ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(store.get(arrowLabel).text === 'AMQP', `reloading reverted the arrow label to ${JSON.stringify(store.get(arrowLabel).text)}`);
}

// --- and it is the missing seed that keeps it, not luck ----------------------
//
// The same run with the seed put back, which is the code as it stood under
// stage 5. If this does not revert, the check above is passing for some reason
// other than the deletion.
//
// The revert takes one more step than it used to. Nothing expands a label on
// the way out any more, so a stale seed sits there inertly until an agent
// writes to the container carrying it — and then the write boundary reads it
// and puts the old words back over the human's. Moving a box is enough, and
// moving a box is the commonest thing an agent does to one.

{
  const store = boardOf(drawn(), { keepSeed: true });
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, types: { svc: 'Ledger' } });
  assert(store.get(shapeLabel).text === 'Ledger', 'the model never got the human edit to the server at all');
  assert(store.get('svc').label?.text === 'AuthService', 'the revert did not put a stale seed on the board');
  write(store, [{ id: 'svc', x: 40 }], { keepSeed: true });
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
  assert(
    store.get(shapeLabel).text === 'AuthService',
    'with the seed back the model failed to reproduce the revert, so it is toothless'
  );
}

// --- and an agent write does not revert it now -------------------------------
//
// The same nudge, against the board as it is. Moving a box must not carry a
// rename with it.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, types: { svc: 'Ledger' } });
  write(store, [{ id: 'svc', x: 40 }]);
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
  assert(
    store.get(shapeLabel).text === 'Ledger',
    `moving the box reverted its label to ${JSON.stringify(store.get(shapeLabel).text)}`
  );
}

// --- an agent renaming after a human still wins ------------------------------
//
// Deleting the seed must not cost an agent its rename. The seed is still the
// way an agent says what a label reads; what changed is that the write
// boundary consumes it into the text element instead of keeping a copy.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, types: { svc: 'Ledger' } });
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
  write(store, [{ id: 'svc', label: { text: 'PostingEngine' } }]);
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  assert(store.get(shapeLabel).text === 'PostingEngine', `an agent rename after a human edit reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(seeded(store).length === 0, `an agent rename left a seed on ${seeded(store).join(', ')}`);
  assert(boundTextsByContainer([...store.values()]).get('svc')?.length === 1, 'the two renames between them grew a second label');
  assert(store.size === 6, `the two renames between them changed the element count to ${store.size}`);
}

// --- a human clearing a label keeps it cleared -------------------------------
//
// Emptying is not retyping with an empty string. Excalidraw deletes the bound
// text element rather than editing it, so the report says only that an element
// is gone. That used to leave the seed it had been expanded from sitting on
// the server, waiting for the next write to that box to put the words back
// (TASK-029).

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const before = boundTextsByContainer([...store.values()]);
  const shapeLabel = before.get('svc')[0];
  const arrowLabel = before.get('wire')[0];

  const { deletes } = cycle(store, baseline, { contain: true, empties: { svc: true, wire: true } });
  assert(deletes.includes(shapeLabel), 'clearing a label did not report the text element as deleted');
  assert(!store.has(shapeLabel), 'the cleared shape label survived on the server');
  assert(!store.has(arrowLabel), 'the cleared arrow label survived on the server');

  for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });
  const after = boundTextsByContainer([...store.values()]);
  assert(after.get('svc') === undefined, `a cleared shape label grew back ${after.get('svc')?.length} bound texts`);
  assert(after.get('wire') === undefined, `a cleared arrow label grew back ${after.get('wire')?.length} bound texts`);
  assert(seeded(store).length === 0, `clearing left a seed to grow back from on ${seeded(store).join(', ')}`);
  assert(store.size === 4, `clearing two of three labels left ${store.size} elements, expected 4`);

  // The label 'Gateway' was never touched and must be exactly where it was.
  const gateway = after.get('gw');
  assert(gateway?.length === 1, `clearing other labels left ${gateway?.length} on the untouched shape`);
  assert(store.get(gateway[0]).text === 'Gateway', 'clearing a label disturbed a different one');

  // A page reload is the pass that brought the old words back: the whole board
  // arrives from the server at once, so every surviving seed was expanded again.
  const reloaded = new Map();
  cycle(store, reloaded, { contain: true });
  assert(
    boundTextsByContainer([...store.values()]).get('svc') === undefined,
    'reloading brought the cleared shape label back'
  );
  assert(store.size === 4, `reloading a board with cleared labels left ${store.size} elements`);

  // And the box can be labelled again afterwards: a container that has been
  // cleared must still be able to hold a label.
  write(store, [{ id: 'svc', label: { text: 'Ledger' } }]);
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const relabelled = boundTextsByContainer([...store.values()]).get('svc');
  assert(relabelled?.length === 1, `relabelling a cleared shape gave it ${relabelled?.length ?? 0} bound texts`);
  assert(store.get(relabelled[0]).text === 'Ledger', 'a cleared shape could not be labelled again');
}

// --- and it is the missing seed that keeps it cleared, not luck --------------
//
// The same run with the seed put back. If this does not bring the old words
// back, the check above is passing for some other reason than the deletion.

{
  const store = boardOf(drawn(), { keepSeed: true });
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, empties: { svc: true } });
  assert(!store.has(shapeLabel), 'the model never got the deletion to the server at all');
  // As with the rename above, the seed is inert until an agent writes to the
  // container carrying it. Then the write boundary reads it and puts the words
  // a human deleted back on the board.
  write(store, [{ id: 'svc', x: 40 }], { keepSeed: true });
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });

  const revived = boundTextsByContainer([...store.values()]).get('svc');
  assert(
    revived?.length === 1 && store.get(revived[0]).text === 'AuthService',
    'with the seed back the model failed to reproduce the label coming back, so it is toothless'
  );
}

// --- absence is not a deletion, and no longer has to be told apart -----------
//
// This used to be the trap. A shape an agent had just labelled, whose seed had
// not been expanded yet, had no bound text — exactly like a shape whose label a
// human had cleared. Whatever struck out stale seeds had to tell the two
// apart, on the strength of the deleted text element still sitting in the
// scene, or it would wipe the agent's label and undo TASK-024.
//
// Neither board carries a seed now, so there are no two states to distinguish.
// A container the board has not labelled yet gets its label from the write
// that names it; a container whose label was deleted has nothing to say and
// gets nothing.

{
  const fresh = expandForBoard(
    [{ id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } }],
    new Map());
  assert(fresh.length === 2, `an agent's label produced ${fresh.length} elements, not a box and its text`);
  assert(seedOf(fresh.find((el) => el.id === 'svc')) === undefined,
    'the write boundary handed the seed on to the board instead of consuming it');

  const cleared = new Map([
    ['gw', { id: 'gw', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, boundElements: [] }]
  ]);
  const nudged = expandForBoard([{ ...cleared.get('gw'), x: 40 }], cleared);
  assert(nudged.length === 1, `moving a cleared box grew ${nudged.length - 1} labels`);
}

// --- clearing and retyping do not get in each other's way --------------------

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  // One box cleared and another retyped in the same pass.
  cycle(store, baseline, { contain: true, empties: { gw: true }, types: { svc: 'Ledger' } });
  for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });

  assert(store.get(shapeLabel).text === 'Ledger', `the retyped label reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(boundTextsByContainer([...store.values()]).get('gw') === undefined, 'the cleared label came back');
  assert(seeded(store).length === 0, `a clearing and a retype together left a seed on ${seeded(store).join(', ')}`);
  assert(store.size === 5, `clearing one label and retyping another left ${store.size} elements, expected 5`);
}

// --- an element drawn later still gets its label, exactly once --------------

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  write(store, [{ id: 'cache', type: 'rectangle', x: 0, y: 200, width: 200, height: 80, label: { text: 'Cache' } }]);
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const labels = boundTextsByContainer([...store.values()]);
  assert(labels.get('cache')?.length === 1, `a newly drawn label got ${labels.get('cache')?.length ?? 0} bound texts`);
  const text = store.get(labels.get('cache')[0]);
  assert(text?.text === 'Cache', `newly drawn label reads ${JSON.stringify(text?.text)}`);
}

// --- a label whose text element the container has forgotten still shows -----
//
// A binding is recorded in two places and either can be the one that survives:
// the text element names its container in `containerId`, the container names
// its text in `boundElements`. A note edited by hand, a scene imported from
// elsewhere, a pane that reported one and not the other — any of them can
// leave a board where only the text end of it is written down.
//
// The converter looks at the container's end, so on such a board it would read
// a write carrying a label as a label nobody had expanded, and expand a second
// one. `expandForBoard` squares the reference against the board first. This is
// what stage 5 took on from `planLabelExpansion`, and it survives the seed:
// the write that trips it is a rename, which is a seed by definition.

{
  const board = new Map([
    ['svc', { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80 }],
    ['svclabel', { id: 'svclabel', type: 'text', containerId: 'svc', text: 'AuthService' }]
  ]);
  const written = expandForBoard(
    [{ ...board.get('svc'), label: { text: 'IdentityService' } }], board);
  const container = written.find((element) => element.id === 'svc');
  assert(
    (container.boundElements ?? []).some((ref) => ref.type === 'text' && ref.id === 'svclabel'),
    'a one-directional binding was not repaired, so the label would not be drawn'
  );
  assert(written.length === 1, `the container grew a second label: ${written.length} elements`);
}

// --- a text element is content, not a label --------------------------------

{
  const written = expandForBoard(
    [{ id: 'note', type: 'text', x: 0, y: 0, text: 'a note to self' }], new Map());
  assert(written.length === 1 && written[0].text === 'a note to self',
    'a standalone text element lost its content or grew a label');
}

// --- a label with no bound text becomes one ---------------------------------

{
  const seeded = expandForBoard(
    [{ id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } }],
    new Map());
  assert(seeded.length === 2, `an unexpanded label produced ${seeded.length} elements, not two`);
  assert(seeded.find((el) => el.type === 'text')?.text === 'AuthService', 'an unexpanded label was dropped');

  // A reference to a text element that is not on the board is not a label
  // either — an element left holding one must still be able to grow a real one.
  const dangling = expandForBoard([{
    id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80,
    label: { text: 'AuthService' }, boundElements: [{ id: 'gone', type: 'text' }]
  }], new Map());
  assert(dangling.find((el) => el.type === 'text')?.text === 'AuthService',
    'a dangling reference suppressed a real label');
}

// --- repair puts a polluted board back ---------------------------------------

{
  const store = boardOf(drawn(), { keepSeed: true });
  const baseline = new Map();
  for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: false });
  const polluted = [...store.values()];

  const plan = planLabelRepair(polluted);
  assert(plan.duplicates.length === 3, `repair found ${plan.duplicates.length} duplicated containers, expected 3`);

  const doomed = new Set(plan.removeIds);
  const rebind = new Map(plan.rebind.map((entry) => [entry.id, entry.boundElements]));
  const repaired = polluted
    .filter((element) => !doomed.has(element.id))
    .map((element) => (rebind.has(element.id) ? { ...element, boundElements: rebind.get(element.id) } : element));

  assert(repaired.length === 6, `repaired board has ${repaired.length} elements, expected 6`);
  assert(worstLabelCount(repaired) === 1, 'repair left a container with more than one bound text');
  assert(planLabelRepair(repaired).duplicates.length === 0, 'repair is not a fixed point');
  assert(
    repaired.filter((el) => el.type === 'text').map((t) => t.text).sort().join('|') === 'AuthService|Gateway|HTTP',
    'repair dropped a label a human could read'
  );

  // And the repaired board must not start breeding again.
  const reopened = boardOf(repaired);
  const freshBaseline = new Map();
  for (let i = 0; i < CYCLES; i++) cycle(reopened, freshBaseline, { contain: true });
  assert(reopened.size === 6, `repaired board grew back to ${reopened.size} elements`);
  assert(worstLabelCount([...reopened.values()]) === 1, 'repaired board started duplicating again');
}

// --- a label sits where its container puts it -------------------------------
//
// Excalidraw recomputes a bound text's position from its container every time
// it draws one, so stored coordinates that are wrong still look right. The
// readers that work from coordinates rather than pixels — the scene bounding
// box, and so zoom-to-fit and the crop of an image export, and the relative
// position signals `describe` and `compare` are built on — get the wrong
// answer, quietly (TASK-034).

const placed = () => [
  { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80 },
  { id: 'svc-label', type: 'text', containerId: 'svc', x: 50, y: 27, width: 100, height: 26, text: 'AuthService' },
  { id: 'wire', type: 'arrow', x: 200, y: 40, width: 200, height: 0, points: [[0, 0], [200, 0]] },
  { id: 'wire-label', type: 'text', containerId: 'wire', x: 275, y: 27, width: 50, height: 26, text: 'HTTP' }
];

{
  const [shape, , arrow] = placed();
  assert(
    JSON.stringify(labelAnchorOf(shape)) === JSON.stringify({ x: 100, y: 40 }),
    `a shape hangs its label from ${JSON.stringify(labelAnchorOf(shape))}, not its centre`
  );
  assert(
    JSON.stringify(labelAnchorOf(arrow)) === JSON.stringify({ x: 300, y: 40 }),
    `a two-point arrow hangs its label from ${JSON.stringify(labelAnchorOf(arrow))}, not its midpoint`
  );

  // Excalidraw takes the middle vertex of an odd-length path and the midpoint
  // of the middle segment of an even one, so an elbowed arrow labels itself at
  // the bend rather than at the average of its ends.
  const elbow = { id: 'e', type: 'arrow', x: 0, y: 0, points: [[0, 0], [100, 0], [100, 100]] };
  assert(
    JSON.stringify(labelAnchorOf(elbow)) === JSON.stringify({ x: 100, y: 0 }),
    `an odd-length path anchors at ${JSON.stringify(labelAnchorOf(elbow))}, not its middle vertex`
  );

  // An arrow measures itself from its points, never from the stored width and
  // height: the server re-routes a path without re-measuring the box round it.
  const stale = { id: 's', type: 'arrow', x: 0, y: 0, width: 9999, height: 9999, points: [[0, 0], [200, 0]] };
  assert(
    labelAnchorOf(stale)?.x === 100,
    'an arrow trusted its stale width instead of its points'
  );

  // The answer has to be knowable, or there is no answer. Moving a label to a
  // guess is worse than leaving it where somebody can see it is wrong.
  assert(labelAnchorOf({ id: 'p', type: 'arrow', x: 0, y: 0 }) === undefined, 'a pathless arrow invented an anchor');
  assert(labelAnchorOf({ id: 'n', type: 'rectangle' }) === undefined, 'a shape with no coordinates invented an anchor');
  assert(
    boundTextPlacement(placed()[0], { id: 't', type: 'text' }) === undefined,
    'an unmeasured label was given a position'
  );
}

// --- moving, resizing and re-routing all take the label with them ------------
//
// The three ways a container's geometry changes under the API, each modelled as
// the server does it: the container is written, then every bound text it holds
// is settled back onto it.

function settle(elements, ids) {
  const moves = new Map(recentreBoundTexts(elements, ids).map((move) => [move.id, move]));
  return elements.map((element) => {
    const move = moves.get(element.id);
    return move ? { ...element, x: move.x, y: move.y } : element;
  });
}

const sceneBox = (elements) => ({
  minX: Math.min(...elements.map((el) => el.x)),
  minY: Math.min(...elements.map((el) => el.y)),
  maxX: Math.max(...elements.map((el) => el.x + (el.width ?? 0))),
  maxY: Math.max(...elements.map((el) => el.y + (el.height ?? 0)))
});

{
  const start = placed();
  assert(boundTextDrift(start).length === 0, 'the fixture starts out drifted');

  // Moved.
  const moved = start.map((el) => (el.id === 'svc' ? { ...el, x: 0, y: 900 } : el));
  const strayed = boundTextDrift(moved);
  assert(strayed.length === 1 && strayed[0].textId === 'svc-label',
    `moving a box did not strand its label (${strayed.length} drifted)`);
  assert(strayed[0].distance > 800, `the stranded label reads ${Math.round(strayed[0].distance)}px from its box`);
  // The phantom region: the box is at y=900 and the label it left behind holds
  // the top of the scene at y=27, so everything that frames the board frames a
  // rectangle of empty canvas nearly nine hundred pixels tall.
  const strandedBox = sceneBox(moved.filter((el) => el.id.startsWith('svc')));
  assert(strandedBox.maxY - strandedBox.minY > 900,
    `the model does not reproduce the phantom region (${Math.round(strandedBox.maxY - strandedBox.minY)}px tall)`);
  const settledMove = settle(moved, ['svc']);
  assert(boundTextDrift(settledMove).length === 0, 'settling did not bring the moved label along');
  assert(settledMove.find((el) => el.id === 'svc-label').y === 927, 'the moved label did not land on its box');
  const closedBox = sceneBox(settledMove.filter((el) => el.id.startsWith('svc')));
  assert(closedBox.minY === 900 && closedBox.maxY === 980, 'the phantom region survived settling');

  // Resized. Nobody has abandoned the label here — it is still inside the box —
  // so the invariant stays quiet and it is the settle that has to notice.
  const resized = start.map((el) => (el.id === 'svc' ? { ...el, width: 600, height: 400 } : el));
  assert(recentreBoundTexts(resized, ['svc']).length === 1, 'resizing a box did not knock its label off centre');
  const settledResize = settle(resized, ['svc']);
  assert(boundTextDrift(settledResize).length === 0, 'settling did not re-centre the resized box\'s label');
  const centred = settledResize.find((el) => el.id === 'svc-label');
  assert(centred.x === 250 && centred.y === 187, `the resized box's label sits at ${centred.x},${centred.y}`);

  // Re-routed: the arrow's path is recomputed, which moves its midpoint.
  const rerouted = start.map((el) =>
    el.id === 'wire' ? { ...el, x: 200, y: 40, points: [[0, 0], [300, 400]] } : el);
  assert(recentreBoundTexts(rerouted, ['wire']).length === 1, 're-routing an arrow did not leave its label behind');
  const settledRoute = settle(rerouted, ['wire']);
  assert(boundTextDrift(settledRoute).length === 0, 'settling did not move the re-routed label to the new midpoint');
  const onWire = settledRoute.find((el) => el.id === 'wire-label');
  assert(onWire.x === 325 && onWire.y === 227, `the re-routed label sits at ${onWire.x},${onWire.y}`);

  // A settle that has nothing to do says nothing, so an update that moved
  // nothing cannot bump a text element's version or wake the change feed.
  assert(recentreBoundTexts(start).length === 0, 'a settled board still had labels to move');
  assert(recentreBoundTexts(settledMove, ['wire']).length === 0, 'settling one container disturbed another');
}

// --- the invariant is generous about alignment and strict about abandonment --

{
  // Excalidraw parks a top-aligned label against the container's top edge, so
  // the check has to allow half a container's worth of offset. It is looking
  // for a label the board forgot, not a label with an opinion.
  const topAligned = placed().map((el) => (el.id === 'svc-label' ? { ...el, y: 5 } : el));
  assert(boundTextDrift(topAligned).length === 0, 'a top-aligned label was read as drift');

  // A duplicate that is nowhere near its container is still drift: every one
  // of them counts, not just the one Excalidraw happens to draw.
  const twinned = [
    ...placed(),
    { id: 'svc-copy', type: 'text', containerId: 'svc', x: -900, y: -900, width: 100, height: 26, text: 'AuthService' }
  ];
  assert(
    boundTextDrift(twinned).some((entry) => entry.textId === 'svc-copy'),
    'a stray duplicate label was not reported as drifted'
  );

  // Nothing to measure is not drift. A board mid-repair must not fail a check
  // for facts it does not have.
  assert(
    boundTextDrift([{ id: 'c', type: 'rectangle' }, { id: 'c-l', type: 'text', containerId: 'c', text: 'x' }]).length === 0,
    'a container with no coordinates was reported as drifted'
  );
}

// --- the pane rescues a lost label and fine-tunes nothing --------------------
//
// The browser has to be more careful than the server. Excalidraw is the
// authority on where it draws a label, and it does not always agree with this
// module to the pixel — a curved multi-point arrow hangs its label from the
// bezier. Correcting a pixel would start the argument all over again: the pane
// moves it, Excalidraw moves it back, the report carries that, the next
// delivery moves it again. So the pane acts only where the record is plainly
// wrong, which is what `frontend/src/canvas/elements.ts` calls on every
// conversion.

{
  const start = placed();
  assert(rescueDriftedBoundTexts(start).length === 0, 'a settled board was rearranged by the rescue');

  // Excalidraw's own placement, a few pixels from ours. Left alone.
  const nudged = start.map((el) => (el.id === 'wire-label' ? { ...el, x: el.x + 6, y: el.y - 4 } : el));
  assert(rescueDriftedBoundTexts(nudged).length === 0,
    'the pane argued with Excalidraw over a few pixels, which is how the loop starts');

  // What the converter actually did to a real arrow label: minted it more than
  // a thousand pixels from the arrow, where nothing on screen shows it.
  const lost = start.map((el) => (el.id === 'wire-label' ? { ...el, x: 15, y: -82 } : el));
  const rescue = rescueDriftedBoundTexts(lost);
  assert(rescue.length === 1 && rescue[0].id === 'wire-label',
    `the rescue moved ${rescue.length} label(s), expected the lost one`);
  assert(Math.round(rescue[0].x) === 275 && Math.round(rescue[0].y) === 27,
    `the rescued arrow label was sent to ${Math.round(rescue[0].x)},${Math.round(rescue[0].y)}`);
  const rescued = lost.map((el) => (el.id === 'wire-label' ? { ...el, x: rescue[0].x, y: rescue[0].y } : el));
  assert(boundTextDrift(rescued).length === 0, 'the rescue did not put the label back on its arrow');
  assert(rescueDriftedBoundTexts(rescued).length === 0, 'the rescue is not a fixed point');
}

// --- and every fixture in this file holds the invariant ----------------------
//
// The boards the rest of these checks build are the ones this is run over: if
// containment, a rename or a repair ever moves a label off the thing it names,
// it fails here.

{
  const boards = { drawn: drawn(), placed: placed() };
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  boards['round-tripped'] = [...store.values()];

  const polluted = boardOf(drawn());
  const pollutedBaseline = new Map();
  for (let i = 0; i < CYCLES; i++) cycle(polluted, pollutedBaseline, { contain: false });
  const plan = planLabelRepair([...polluted.values()]);
  const doomed = new Set(plan.removeIds);
  boards.repaired = [...polluted.values()].filter((element) => !doomed.has(element.id));

  for (const [name, elements] of Object.entries(boards)) {
    const drifted = boundTextDrift(elements);
    assert(
      drifted.length === 0,
      `${name}: ${drifted.length} bound text(s) further from their container than its size allows` +
        (drifted[0] ? ` — ${JSON.stringify(drifted[0].text)} at ${Math.round(drifted[0].distance)}px` : '')
    );
  }
}

// --- and the server actually applies it --------------------------------------
//
// The rest of this file is a model. This is the real update path: a real
// server, a labelled shape and a labelled arrow with real bound text elements,
// moved and resized and re-routed over HTTP the way `update`, `apply`, `arrange
// align` and `arrange distribute` all do it — and then saved to a vault note
// and opened again, because a board that comes back drifted is a board every
// later screenshot frames wrongly.

{
  // A different port each run, so two checkouts running the suite at once do
  // not serialise on one, and so this never lands on somebody's real canvas.
  const PORT = 35000 + Math.floor(Math.random() * 2000);
  const base = `http://127.0.0.1:${PORT}`;
  const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-labels-'));
  const server = spawn(process.execPath, [join(__dirname, '..', 'src', 'server.ts')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const api = async (method, url, body) => {
    // Every write says what it is doing, once for the whole check (TASK-095,
    // scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
    url = withDoing(url, method, 'checking that a label goes where its shape goes');
    const response = await fetch(`${base}${url}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
    return response.json().catch(() => null);
  };
  const board = '?board=scratch';
  const elementsOn = async (key = 'scratch') =>
    (await api('GET', `/api/elements?board=${encodeURIComponent(key)}`))?.elements ?? [];
  const driftOn = async (key) => boundTextDrift(await elementsOn(key));

  try {
    for (let i = 0; i < 100; i++) {
      try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
    }

    await api('POST', `/api/elements/batch${board}`, {
      elements: [
        { id: 'svc', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, label: { text: 'AuthService' } },
        { id: 'gw', type: 'rectangle', x: 600, y: 100, width: 200, height: 100, label: { text: 'Gateway' } },
        { id: 'pg', type: 'rectangle', x: 600, y: 700, width: 200, height: 100, label: { text: 'Postgres' } },
        {
          id: 'wire', type: 'arrow', x: 300, y: 150, width: 300, height: 0,
          start: { id: 'svc' }, end: { id: 'gw' }, label: { text: 'HTTP' }
        }
      ]
    });

    // The bound texts are already there, and no pane made them.
    //
    // This is what stage 5 changed. A label used to reach a text element only
    // when a browser rendered it: the write left `label: {text}` on the shape,
    // Excalidraw's converter expanded it on delivery, and the pane reported
    // back what it had made. So a headless board had labels nothing could read
    // and this check had to manufacture that report itself. Now the one
    // converter runs at the write boundary and four labelled elements are
    // eight elements on the board (ADR 0015).
    const drawn = await elementsOn();
    assert(drawn.length === 8,
      `four labelled elements became ${drawn.length} on the board, not eight`);
    const drawnLabels = boundTextsByContainer(drawn);
    for (const id of ['svc', 'gw', 'pg', 'wire']) {
      assert(drawnLabels.get(id)?.length === 1,
        `${id} came back with ${drawnLabels.get(id)?.length ?? 0} bound texts, not one`);
    }
    assert((await driftOn('scratch')).length === 0, 'the newly drawn board was drifted before anything moved');

    // And the seed that asked for those labels is not on the board. It was
    // read, it produced four text elements, and it is spent (TASK-073).
    const held = drawn.filter((element) => seedOf(element) !== undefined).map((element) => element.id);
    assert(held.length === 0, `the board came back holding a label seed on ${held.join(', ')}`);

    await api('PUT', `/api/elements/svc${board}`, { x: 100, y: 900 });
    let drifted = await driftOn('scratch');
    assert(drifted.length === 0,
      `moving a shape stranded ${drifted.length} label(s): ${drifted.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(', ')}`);

    await api('PUT', `/api/elements/gw${board}`, { width: 500, height: 400 });
    drifted = await driftOn('scratch');
    assert(drifted.length === 0,
      `resizing a shape stranded ${drifted.length} label(s): ${drifted.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(', ')}`);

    await api('PUT', `/api/elements/wire${board}`, { points: [[0, 0], [400, 500]] });
    assert((await driftOn('scratch')).length === 0, 're-pointing an arrow stranded its label');

    await api('PUT', `/api/elements/wire${board}`, { end: { id: 'pg' } });
    const wire = (await elementsOn()).find((element) => element.id === 'wire');
    assert(
      JSON.stringify(wire.points) !== JSON.stringify([[0, 0], [400, 500]]),
      'pointing an arrow at a different shape did not re-route it'
    );
    assert((await driftOn('scratch')).length === 0, 're-binding an arrow stranded its label');

    // The stray label is not just close enough — it is where Excalidraw draws
    // it, to the pixel, so the scene box is the box a person would draw.
    const scene = await elementsOn();
    const byId = new Map(scene.map((element) => [element.id, element]));
    for (const [containerId, textIds] of boundTextsByContainer(scene)) {
      const text = byId.get(textIds[0]);
      const wanted = boundTextPlacement(byId.get(containerId), text);
      assert(
        Math.abs(text.x - wanted.x) < 0.5 && Math.abs(text.y - wanted.y) < 0.5,
        `${JSON.stringify(text.text)} is stored at ${Math.round(text.x)},${Math.round(text.y)} ` +
        `where its container draws it at ${Math.round(wanted.x)},${Math.round(wanted.y)}`
      );
    }

    // A rename over the single-element route, which is what `update <id> --set
    // '{"text": ...}'` performs. The seed is the way to ask for it and it is
    // still consumed rather than kept: the route used to store the merge and
    // then store only what the conversion added, which left the old words on
    // the board for the next write to read back (TASK-073).
    await api('PUT', `/api/elements/svc${board}`, { label: { text: 'IdentityService' } });
    const renamed = await elementsOn();
    const svcLabels = boundTextsByContainer(renamed).get('svc') ?? [];
    assert(svcLabels.length === 1, `renaming over PUT left svc with ${svcLabels.length} bound texts`);
    assert(renamed.find((element) => element.id === svcLabels[0])?.text === 'IdentityService',
      'the rename did not reach the text element that is the label');
    assert(seedOf(renamed.find((element) => element.id === 'svc')) === undefined,
      'a rename over PUT left its seed on the board');
    assert(renamed.length === 8, `renaming changed the board from 8 elements to ${renamed.length}`);

    // Saved to a note and opened again: what the vault holds is what the board
    // becomes, so the invariant has to survive the round trip.
    const saved = await api('POST', `/api/boards/save${board}`, { name: 'labelled' });
    assert(saved?.success === true, `saving the board failed: ${JSON.stringify(saved?.error ?? saved)}`);
    const reopened = await api('POST', '/api/boards/open', { board: 'labelled' });
    assert(reopened?.success === true, `reopening the board failed: ${JSON.stringify(reopened?.error ?? reopened)}`);
    const back = await driftOn('labelled');
    assert(back.length === 0,
      `a board saved and reopened came back with ${back.length} drifted label(s): ` +
      back.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(', '));
  } finally {
    server.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} label checks failed`);
  process.exit(1);
}
console.log(`labels: ${checks} checks passed`);
