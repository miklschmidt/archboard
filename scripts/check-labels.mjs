#!/usr/bin/env bun

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

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  planLabelExpansion,
  adoptReusedLabelIds,
  boundTextsByContainer,
  planLabelRepair,
  labelStatements,
  labelClearances,
  labelAnchorOf,
  boundTextPlacement,
  recentreBoundTexts,
  boundTextDrift,
  rescueDriftedBoundTexts,
  labelTextIdFor
} = await import(join(__dirname, '..', 'src', 'core', 'labels.ts'));
const { isBlockId } = await import(join(__dirname, '..', 'src', 'core', 'ids.ts'));

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
  store.set('svc', { ...store.get('svc'), label: { text: 'IdentityService' } });
  for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
  assert(
    boundTextsByContainer([...store.values()]).get('svc')?.[0] === seen[0],
    'renaming a label renamed the element carrying it'
  );
}

{
  // The id is derived from the container, so a label cleared and written again
  // must not be handed the cleared element's name back — the deleted element is
  // still in the document, and two elements cannot share a name.
  const scene = [
    { id: 'svc', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, label: { text: 'AuthService' } },
    { id: labelTextIdFor('svc'), type: 'text', containerId: 'svc', text: '', isDeleted: true }
  ];
  const planned = planLabelExpansion(scene);
  const wanted = planned.reuse.get('svc') ?? { id: undefined };
  assert(wanted.id !== undefined, 'a label with no live text element was not named');
  assert(wanted.id !== labelTextIdFor('svc'), 'a re-expanded label took the cleared element’s name');
  assert(isBlockId(wanted.id), `the salted name is not a block id (${wanted.id})`);

  // A label that says nothing is not expanded, so there is nothing to name.
  assert(
    planLabelExpansion([{ id: 'bare', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }]).reuse.size === 0,
    'an unlabelled shape was given a label id'
  );

  // And the cleared element keeps its own name through the adoption, so the
  // scene does not end up with two elements answering to one.
  const adopted = adoptReusedLabelIds(expand(planned.elements), planned.reuse);
  const ids = adopted.map((element) => element.id);
  assert(new Set(ids).size === ids.length, `adoption produced a duplicate id: ${ids.join(', ')}`);
  assert(
    adopted.some((element) => element.isDeleted && element.id === labelTextIdFor('svc')),
    'the cleared label was renamed onto the new one'
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

    // A pane reports what Excalidraw made of those labels: one bound text each,
    // placed where the renderer draws it. Everything after this is the server
    // moving containers on its own, with no browser to correct it.
    const upserts = [];
    for (const element of await elementsOn()) {
      if (!element.label?.text) continue;
      const width = element.label.text.length * 10;
      const anchor = labelAnchorOf(element);
      upserts.push({ ...element, boundElements: [...(element.boundElements ?? []), { id: `${element.id}-l`, type: 'text' }] });
      upserts.push({
        id: `${element.id}-l`, type: 'text', containerId: element.id, text: element.label.text,
        x: anchor.x - width / 2, y: anchor.y - 12.5, width, height: 25
      });
    }
    await api('POST', `/api/elements/changes${board}`, { upserts, deletes: [], clientId: 'pane' });
    assert((await driftOn('scratch')).length === 0, 'the seeded board was drifted before anything moved');

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
