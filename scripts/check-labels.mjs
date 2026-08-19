#!/usr/bin/env node

// The label feedback loop, run to exhaustion in a few milliseconds.
//
// A labelled element used to grow one extra bound text element on every trip
// through the browser, forever, because Excalidraw's
// convertToExcalidrawElements mints a text element with a new random id every
// time it sees a `label`, and the `label` that produced the first one stayed on
// the stored element (TASK-024). It only shows up over several cycles, and only
// when the three parties are all present: the converter that expands, the pane
// that reports what it did not have before, and the server that merges an
// upsert onto an element it never strips.
//
// So all three are modelled here — small, exact, and headless, since the real
// converter needs a DOM. The point of the model is that it is *hostile*: the
// expander is written to duplicate, exactly like the real one, and the first
// check below proves it does when containment is removed. What is under test is
// that planLabelExpansion / adoptReusedLabelIds hold the line anyway — without
// making labels immutable, which would be the other way to get the count right
// and would break renaming.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  planLabelExpansion,
  adoptReusedLabelIds,
  boundTextsByContainer,
  planLabelRepair,
  labelStatements,
  labelClearances
} = await import(join(__dirname, '..', 'dist', 'core', 'labels.js'));

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

// ─── The three parties ───────────────────────────────────────

let minted = 0;
const freshId = () => `txt-${++minted}`;

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
 * frontend/src/canvas/elements.ts: once a container has its text element, the
 * seed that produced it is not kept in the scene. Modelled because the whole
 * outbound rule rests on it — a seed the pane still held would outlive the
 * delivery that carried it and get written back over a human's typing.
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
 * frontend/src/canvas/changes.ts, the outbound half: a reported bound text goes
 * with a statement of what its container's label now reads, and a *deleted*
 * bound text with the striking out of the seed that would otherwise be expanded
 * back over it. `state` and `clear` are the two fixes under test here, the way
 * `contain` is for the inbound half.
 *
 * A report is built from the live board — deleted elements are never upserted
 * and never enter the baseline — but it is computed against the scene
 * *including* them, because that is the only place the fact of a deletion is
 * recorded.
 */
function reportOf(scene, baseline, { state, clear }) {
  const alive = scene.filter((element) => !element.isDeleted);
  const upserts = alive
    .filter((element) => baseline.get(element.id) !== fingerprint(element))
    .map((element) => ({ ...element }));
  const kept = new Set(alive.map((element) => element.id));
  const deletes = [...baseline.keys()].filter((id) => !kept.has(id));

  const byId = new Map(upserts.map((element) => [element.id, element]));
  if (state) {
    for (const statement of labelStatements(upserts, scene)) {
      const reported = byId.get(statement.id);
      if (reported) reported.label = statement.label;
      else if (baseline.has(statement.id)) upserts.push({ id: statement.id, label: statement.label });
    }
  }
  if (clear) {
    for (const clearance of labelClearances(upserts, deletes, scene)) {
      const reported = byId.get(clearance.id);
      if (reported) {
        reported.label = null;
        reported.text = null;
      } else if (baseline.has(clearance.id)) {
        upserts.push({ id: clearance.id, label: null, text: null });
      }
    }
  }
  return { upserts, deletes };
}

/** POST /api/elements/changes: upserts are *merged*, so stored fields survive. */
function applyUpserts(store, upserts) {
  for (const upsert of upserts) {
    store.set(upsert.id, { ...(store.get(upsert.id) ?? {}), ...upsert });
  }
}

/**
 * One full round trip: the server broadcasts, the pane converts what it got,
 * a human may type into it, and it reports back anything it had not seen.
 * `contain` and `state` are the two halves of the fix under test.
 */
function cycle(store, baseline, { contain, state = contain, clear = contain, types, empties }) {
  const broadcast = [...store.values()];
  const planned = contain ? planLabelExpansion(broadcast) : { elements: broadcast, reuse: new Map() };
  const expanded = expand(planned.elements);
  const adopted = contain ? adoptReusedLabelIds(expanded, planned.reuse) : expanded;
  const scene = contain ? dropSpentSeeds(adopted) : adopted;

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

  const { upserts, deletes } = reportOf(edited, baseline, { state, clear });
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

function boardOf(elements) {
  return new Map(elements.map((element) => [element.id, element]));
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

// --- the model reproduces the bug when containment is removed ---------------
//
// Without this the check could pass because the model is toothless rather than
// because the fix works.

{
  const store = boardOf(drawn());
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
    // Cycle 0 mints the labels; cycle 1 reports the containers once more, with
    // the spent seed no longer on them. After that a settled board is silent.
    if (i > 1 && upserts.length > 0) reports += 1;
  }
  const elements = [...store.values()];
  const labels = boundTextsByContainer(elements);

  assert(store.size === 6, `expected 3 drawn + 3 labels, got ${store.size} after ${CYCLES} cycles`);
  assert(new Set(sizes).size === 1, `board size drifted across cycles: ${sizes.join(',')}`);
  assert(labels.get('svc')?.length === 1, `labelled shape has ${labels.get('svc')?.length} bound texts`);
  assert(labels.get('wire')?.length === 1, `labelled arrow has ${labels.get('wire')?.length} bound texts`);
  assert(reports === 0, `a settled board kept reporting changes on ${reports} of ${CYCLES} cycles`);

  const arrow = store.get('wire');
  assert(JSON.stringify(arrow.points) === '[[0,0],[200,0]]', 'arrow points were rewritten');
  assert(arrow.height === 0 && arrow.width === 200, `arrow geometry collapsed to ${arrow.width}x${arrow.height}`);
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
  store.set('svc', { ...store.get('svc'), label: { text: 'IdentityService' } });
  store.set('wire', { ...store.get('wire'), label: { text: 'gRPC' } });
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const after = boundTextsByContainer([...store.values()]);
  assert(after.get('svc')?.length === 1, `renaming a shape left ${after.get('svc')?.length} labels`);
  assert(after.get('wire')?.length === 1, `renaming an arrow left ${after.get('wire')?.length} labels`);
  assert(after.get('svc')[0] === shapeLabel, 'a renamed shape label became a different element');
  assert(after.get('wire')[0] === arrowLabel, 'a renamed arrow label became a different element');
  assert(store.get(shapeLabel).text === 'IdentityService', `shape label reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(store.get(arrowLabel).text === 'gRPC', `arrow label reads ${JSON.stringify(store.get(arrowLabel).text)}`);
  assert(store.size === 6, `renaming changed the element count to ${store.size}`);
}

// --- a human retyping a label keeps it ---------------------------------------
//
// The other direction, and the one the inbound rule alone gets wrong. A person
// retypes a box on the board: the words land in the text element, the seed on
// the server still says the old name, and the seed is what the next conversion
// pass expands. Unless the report says otherwise, the board writes their edit
// back out again.

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
  assert(store.get('svc').label?.text === 'Ledger', `the stored seed did not follow: ${JSON.stringify(store.get('svc').label)}`);
  assert(store.get('wire').label?.text === 'AMQP', `the stored arrow seed did not follow: ${JSON.stringify(store.get('wire').label)}`);
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

// --- and it is the statement that keeps it, not luck -------------------------
//
// Same run with the outbound half removed. If this does not revert, the check
// above is passing for some reason other than the fix.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true, state: false });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, state: false, types: { svc: 'Ledger' } });
  assert(store.get(shapeLabel).text === 'Ledger', 'the model never got the human edit to the server at all');
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true, state: false });
  assert(
    store.get(shapeLabel).text === 'AuthService',
    'without the label statement the model failed to reproduce the revert, so it is toothless'
  );
}

// --- an agent renaming after a human still wins ------------------------------
//
// The two directions must not cancel each other out: the seed following the
// text outbound cannot make the seed powerless inbound.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, types: { svc: 'Ledger' } });
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
  store.set('svc', { ...store.get('svc'), label: { text: 'PostingEngine' } });
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  assert(store.get(shapeLabel).text === 'PostingEngine', `an agent rename after a human edit reads ${JSON.stringify(store.get(shapeLabel).text)}`);
  assert(store.get('svc').label?.text === 'PostingEngine', 'the agent rename did not settle in the stored seed');
  assert(boundTextsByContainer([...store.values()]).get('svc')?.length === 1, 'the two directions between them grew a second label');
  assert(store.size === 6, `the two directions between them changed the element count to ${store.size}`);
}

// --- a human clearing a label keeps it cleared -------------------------------
//
// Emptying is not retyping with an empty string. Excalidraw deletes the bound
// text element, so there is no text upsert for a statement to ride on, and the
// seed the deleted element came from sits on the server waiting to be expanded
// straight back over the box somebody just cleared.

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
  assert(!store.get('svc').label?.text, `the seed survived the clearing: ${JSON.stringify(store.get('svc').label)}`);
  assert(!store.get('wire').label?.text, `the arrow seed survived the clearing: ${JSON.stringify(store.get('wire').label)}`);
  assert(store.size === 4, `clearing two of three labels left ${store.size} elements, expected 4`);

  // The label 'Gateway' was never touched and must be exactly where it was.
  const gateway = after.get('gw');
  assert(gateway?.length === 1, `clearing other labels left ${gateway?.length} on the untouched shape`);
  assert(store.get(gateway[0]).text === 'Gateway', 'clearing a label disturbed a different one');
  assert(store.get('gw').label?.text === 'Gateway', 'clearing a label struck out a different seed');

  // A page reload is the pass that brought the old words back: the whole board
  // arrives from the server at once, so every surviving seed is expanded again.
  const reloaded = new Map();
  cycle(store, reloaded, { contain: true });
  assert(
    boundTextsByContainer([...store.values()]).get('svc') === undefined,
    'reloading brought the cleared shape label back'
  );
  assert(store.size === 4, `reloading a board with cleared labels left ${store.size} elements`);

  // And the box can be labelled again afterwards: striking out the seed must
  // not leave the container unable to hold one.
  store.set('svc', { ...store.get('svc'), label: { text: 'Ledger' } });
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  const relabelled = boundTextsByContainer([...store.values()]).get('svc');
  assert(relabelled?.length === 1, `relabelling a cleared shape gave it ${relabelled?.length ?? 0} bound texts`);
  assert(store.get(relabelled[0]).text === 'Ledger', 'a cleared shape could not be labelled again');
}

// --- and it is the clearance that keeps it cleared, not luck -----------------
//
// The same run with the clearance removed. If this does not bring the old
// words back, the check above is passing for some other reason than the fix.

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true, clear: false });
  const shapeLabel = boundTextsByContainer([...store.values()]).get('svc')[0];

  cycle(store, baseline, { contain: true, clear: false, empties: { svc: true } });
  assert(!store.has(shapeLabel), 'the model never got the deletion to the server at all');
  for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true, clear: false });

  const revived = boundTextsByContainer([...store.values()]).get('svc');
  assert(
    revived?.length === 1 && store.get(revived[0]).text === 'AuthService',
    'without the clearance the model failed to reproduce the label coming back, so it is toothless'
  );
}

// --- absence is not a deletion -----------------------------------------------
//
// The trap. A shape an agent has just labelled, whose seed has not been
// expanded yet, has no bound text — exactly like a shape whose label was
// cleared. Reading that as a clearance would wipe the agent's label and undo
// TASK-024. Only the deleted text element itself tells them apart.

{
  const scene = [
    // An agent's label, delivered and not yet expanded.
    { id: 'svc', type: 'rectangle', label: { text: 'AuthService' } },
    // A human's, just cleared: the text element is gone and unbound.
    { id: 'gw', type: 'rectangle', boundElements: [] },
    { id: 'gw-label', type: 'text', containerId: 'gw', text: '', isDeleted: true }
  ];
  const upserts = [{ id: 'svc' }, { id: 'gw', boundElements: [] }];
  const clearances = labelClearances(upserts, ['gw-label'], scene);
  assert(clearances.length === 1, `expected one clearance, got ${clearances.length}`);
  assert(clearances[0]?.id === 'gw', `the clearance named ${clearances[0]?.id}, not the cleared container`);
  assert(clearances[0]?.label === null && clearances[0]?.text === null, 'a clearance must strike out both seed fields');
  assert(
    !clearances.some((clearance) => clearance.id === 'svc'),
    'an unexpanded agent label was read as a deletion'
  );

  // A container that still has a label is not bereaved, however many of its
  // text elements have been deleted along the way.
  const stillLabelled = [
    { id: 'gw', type: 'rectangle', boundElements: [{ id: 'gw-keeper', type: 'text' }] },
    { id: 'gw-keeper', type: 'text', containerId: 'gw', text: 'Gateway' },
    { id: 'gw-stray', type: 'text', containerId: 'gw', text: '', isDeleted: true }
  ];
  assert(
    labelClearances([{ id: 'gw' }], ['gw-stray'], stillLabelled).length === 0,
    'a container that still shows a label was told to clear it'
  );

  // A deleted element the report is not talking about is old news. Restating
  // the clearance on every later pass would rewrite the element for nothing.
  assert(
    labelClearances([], [], scene).length === 0,
    'a lingering deleted label kept restating its clearance'
  );

  // Nor is a container that went with it something to make statements about.
  const bothGone = [
    { id: 'gw', type: 'rectangle', isDeleted: true },
    { id: 'gw-label', type: 'text', containerId: 'gw', text: 'Gateway', isDeleted: true }
  ];
  assert(
    labelClearances([], ['gw-label', 'gw'], bothGone).length === 0,
    'a deleted container was sent a label clearance'
  );
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
  assert(store.get('svc').label?.text === 'Ledger', 'the retyped seed did not follow while another label was cleared');
  assert(boundTextsByContainer([...store.values()]).get('gw') === undefined, 'the cleared label came back');
  assert(!store.get('gw').label?.text, 'the cleared seed survived alongside a retype');
  assert(store.size === 5, `clearing one label and retyping another left ${store.size} elements, expected 5`);
}

// --- an element drawn later still gets its label, exactly once --------------

{
  const store = boardOf(drawn());
  const baseline = new Map();
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  store.set('cache', { id: 'cache', type: 'rectangle', x: 0, y: 200, width: 200, height: 80, label: { text: 'Cache' } });
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });

  const labels = boundTextsByContainer([...store.values()]);
  assert(labels.get('cache')?.length === 1, `a newly drawn label got ${labels.get('cache')?.length ?? 0} bound texts`);
  const text = store.get(labels.get('cache')[0]);
  assert(text?.text === 'Cache', `newly drawn label reads ${JSON.stringify(text?.text)}`);
}

// --- a label whose text element the container has forgotten still shows -----
//
// A pane reports the text element the instant a human types; the container it
// belongs to often has nothing new to say and never names it back. The label
// must still be drawn, which means the reference has to be restored.

{
  const oneWay = [
    { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } },
    { id: 'svc-label', type: 'text', containerId: 'svc', text: 'AuthService' }
  ];
  const { elements: planned } = planLabelExpansion(oneWay);
  const container = planned.find((element) => element.id === 'svc');
  assert(
    (container.boundElements ?? []).some((ref) => ref.type === 'text' && ref.id === 'svc-label'),
    'a one-directional binding was not repaired, so the label would not be drawn'
  );
  assert(container.label === undefined, 'a label that already exists was left to be expanded again');
  assert(planned.length === 2, 'the existing text element was disturbed by a label that had not changed');
}

// --- a text element is content, not a label --------------------------------

{
  const standalone = [{ id: 'note', type: 'text', x: 0, y: 0, text: 'a note to self' }];
  const { elements: planned } = planLabelExpansion(standalone);
  assert(planned[0].text === 'a note to self', 'a standalone text element lost its content');
}

// --- a label with no bound text is still a label ----------------------------

{
  const seeded = [{ id: 'svc', type: 'rectangle', label: { text: 'AuthService' } }];
  assert(
    planLabelExpansion(seeded).elements[0].label?.text === 'AuthService',
    'an unexpanded label was dropped'
  );

  // A reference to a text element that is not on the board is not a label
  // either — an element left holding one must still be able to grow a real one.
  const dangling = [{ id: 'svc', type: 'rectangle', label: { text: 'AuthService' }, boundElements: [{ id: 'gone', type: 'text' }] }];
  assert(
    planLabelExpansion(dangling).elements[0].label?.text === 'AuthService',
    'a dangling reference suppressed a real label'
  );
}

// --- repair puts a polluted board back ---------------------------------------

{
  const store = boardOf(drawn());
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

if (failures > 0) {
  console.error(`\n${failures} of ${checks} label checks failed`);
  process.exit(1);
}
console.log(`labels: ${checks} checks passed`);
