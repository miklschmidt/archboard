#!/usr/bin/env bun
// Undo a board that bred labels.
//
// Before TASK-024 was fixed, every trip a labelled element made through the
// browser grew it another bound text element: the stored `label` seed was
// expanded again on each broadcast, the copy synced back, and the next
// broadcast expanded the same seed once more. One real board reached 284
// elements where 41 were drawn, five arrow labels duplicated 42 times each,
// and the arrows carrying the stacks were mangled into hairlines nobody could
// see or grab.
//
// The fix stops the breeding. It cannot un-breed what is already stored, which
// is what this does:
//
//   1. one bound text per container — the one Excalidraw actually draws stays,
//      the invisible copies go
//   2. each container's `boundElements` rewritten to name that one text (arrow
//      bindings in the same list are untouched)
//   3. arrow geometry recomputed, by handing every bound arrow back to the
//      server's own re-router rather than guessing at the maths here
//   4. every bound text put back on the thing it labels
//
// Step 4 undoes a second, quieter way the two halves drift apart (TASK-034):
// moving or resizing a container through the API used to leave its bound text
// where it was. Excalidraw recomputes a label's position from its container
// before drawing it, so the board looked right while the stored coordinates
// were hundreds of pixels out — and the scene bounding box, zoom-to-fit, the
// crop of an image export and the layout signals behind `describe` and
// `compare` all read the coordinates.
//
// Usage:
//   node scripts/repair-labels.mjs [--url URL] [--board KEY] [--dry-run]
//   node scripts/repair-labels.mjs --file scene.excalidraw [--out repaired.excalidraw]
//
// The file form repairs a saved scene (steps 1, 2 and 4 — reconstructing arrow
// geometry needs the board's own bindings resolved, which is the server's job).
// Default URL is EXPRESS_SERVER_URL or http://127.0.0.1:3000.
//
// A board in an Obsidian vault is repaired through the canvas rather than by
// editing the note, so the note's frontmatter and text sections come back
// intact:
//
//   ./bin/canvas board open <name> --reload
//   node scripts/repair-labels.mjs --board <name>
//   ./bin/canvas board save --board <name>

import { readFileSync, writeFileSync } from 'node:fs';
import { boundTextDrift, planLabelRepair, recentreBoundTexts } from '../src/core/labels.ts';
import { remeasureLinear } from '../src/core/geometry.ts';
import { withDoing } from './lib/doing.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(name);

const baseUrl = flag('--url') ?? process.env.EXPRESS_SERVER_URL ?? 'http://127.0.0.1:3000';
const boardKey = flag('--board');
const dryRun = has('--dry-run');
const file = flag('--file');
const outFile = flag('--out') ?? file;

const boardQuery = boardKey ? `?board=${encodeURIComponent(boardKey)}` : '';
const withBoard = (path) => `${baseUrl}${path}${boardKey ? `${path.includes('?') ? '&' : '?'}board=${encodeURIComponent(boardKey)}` : ''}`;

function report(plan, elements) {
  const texts = elements.filter((el) => el.type === 'text').length;
  console.log(`Board holds ${elements.length} elements, ${texts} of them text.`);
  if (plan.duplicates.length === 0) {
    console.log('No container has more than one bound text element. Nothing to repair.');
  } else {
    console.log(`\n${plan.duplicates.length} container(s) carrying duplicate labels:`);
    for (const dup of plan.duplicates) {
      console.log(
        `  ${dup.containerType} ${dup.containerId}: ${JSON.stringify(dup.text)} ` +
        `— keeping ${dup.keep}, removing ${dup.remove.length} cop${dup.remove.length === 1 ? 'y' : 'ies'}`
      );
    }
    console.log(`\n${plan.removeIds.length} text element(s) to delete, ${plan.rebind.length} container(s) to re-bind.`);
  }
  if (plan.orphanIds.length > 0) {
    console.log(
      `\n${plan.orphanIds.length} bound text element(s) name a container that is gone. ` +
      `Left alone — they may be somebody's writing:\n  ${plan.orphanIds.join(', ')}`
    );
  }
  reportDrift(elements);
}

function reportDrift(elements) {
  const strays = boundTextDrift(elements);
  const moves = recentreBoundTexts(elements);
  if (moves.length === 0) {
    console.log('\nEvery bound text already sits where its container draws it.');
    return moves;
  }
  console.log(`\n${moves.length} bound text element(s) to put back on the thing they label:`);
  for (const stray of strays) {
    console.log(
      `  ${stray.containerType} ${stray.containerId}: ${JSON.stringify(stray.text)} ` +
      `— ${Math.round(stray.distance)}px away, which its ${Math.round(stray.allowed)}px of size cannot account for`
    );
  }
  const quiet = moves.length - strays.length;
  if (quiet > 0) console.log(`  …and ${quiet} more that are merely off centre.`);
  return moves;
}

// This one is not a check but a repair somebody runs against a live board, so
// what it says is what it is: putting labels back (TASK-095).
const REPAIRING = 'putting stranded labels back on the shapes they name';

async function json(path, init) {
  const response = await fetch(withDoing(path, init?.method, REPAIRING), init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${body.error ?? response.status}`);
  }
  return body;
}

const put = (id, patch) => json(withBoard(`/api/elements/${encodeURIComponent(id)}`), {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(patch)
});

// ─── Saved scene ─────────────────────────────────────────────

if (file) {
  const scene = JSON.parse(readFileSync(file, 'utf8'));
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const plan = planLabelRepair(elements);
  report(plan, elements);
  if (dryRun) process.exit(0);

  const doomed = new Set(plan.removeIds);
  const rebind = new Map(plan.rebind.map((entry) => [entry.id, entry.boundElements]));
  const kept = elements
    .filter((el) => !doomed.has(el.id))
    .map((el) => (rebind.has(el.id) ? { ...el, boundElements: rebind.get(el.id) } : el));

  // Re-centre after the duplicates are gone, so the label that stays is the one
  // measured against its container.
  const moves = new Map(recentreBoundTexts(kept).map((move) => [move.id, move]));
  scene.elements = kept.map((el) => {
    const move = moves.get(el.id);
    return move ? { ...el, x: move.x, y: move.y } : el;
  });
  if (plan.removeIds.length === 0 && moves.size === 0) process.exit(0);
  if (moves.size > 0) console.log(`\nMoved ${moves.size} bound text element(s) back onto their containers.`);

  writeFileSync(outFile, `${JSON.stringify(scene, null, 2)}\n`);
  console.log(`\nWrote ${scene.elements.length} elements to ${outFile}.`);
  process.exit(0);
}

// ─── Live board ──────────────────────────────────────────────

const { elements } = await json(`${baseUrl}/api/elements${boardQuery}`);
const plan = planLabelRepair(elements);
report(plan, elements);

if (dryRun) {
  console.log('\n--dry-run: nothing was changed.');
  process.exit(0);
}

for (const id of plan.removeIds) {
  await json(withBoard(`/api/elements/${encodeURIComponent(id)}`), { method: 'DELETE' });
}
for (const entry of plan.rebind) {
  await put(entry.id, { boundElements: entry.boundElements });
}
if (plan.removeIds.length > 0) {
  console.log(`\nDeleted ${plan.removeIds.length} duplicate text element(s); re-bound ${plan.rebind.length} container(s).`);
}

// Arrow geometry. A collapsed arrow's points are unrecoverable from the arrow
// itself and entirely recoverable from what it connects, because the server
// recomputes them from the arrow's bindings whenever a bound shape's geometry
// is touched. So re-state each anchor shape's own x, which is a no-op for the
// shape and a reroute for every arrow bound to it.
//
// This used to copy each binding into a `start`/`end` ref first, because the
// routing read only those. It reads the binding now, and the binding carries
// the `focus` and `gap` whoever drew the arrow chose, so copying it into a ref
// would have thrown both away (TASK-088).
//
// Only where labels actually bred, though. A reroute moves every arrow on the
// board, which is the right thing to do to a hairline nobody can grab and quite
// the wrong thing to do to a board whose arrows are exactly where somebody put
// them.
const byId = new Map(elements.map((el) => [el.id, el]));
const anchors = new Set();

for (const el of plan.removeIds.length > 0 ? elements : []) {
  if (el.type !== 'arrow' && el.type !== 'line') continue;
  const start = el.startBinding?.elementId;
  const end = el.endBinding?.elementId;
  if (start && byId.has(start)) anchors.add(start);
  if (end && byId.has(end)) anchors.add(end);
}

for (const id of anchors) {
  const shape = byId.get(id);
  if (!shape || shape.type === 'arrow' || shape.type === 'line') continue;
  await put(id, { x: shape.x, y: shape.y });
}

if (anchors.size > 0) {
  console.log(
    `Rerouted every arrow anchored to ${anchors.size} shape(s).`
  );
}

// The re-router used to write points and leave width/height as it found them,
// which on a mangled arrow is the hairline nobody could grab. It re-measures
// now (TASK-038), so this sweep is for what earlier versions left behind: the
// same measurement, from the same helper the server uses, over every arrow on
// the board rather than only the ones this run touched.
const rerouted = (await json(`${baseUrl}/api/elements${boardQuery}`)).elements;
let resized = 0;
for (const el of rerouted) {
  const measured = remeasureLinear(el);
  if (!measured) continue;
  await put(el.id, measured);
  resized += 1;
}
if (resized > 0) console.log(`Re-measured ${resized} arrow(s) whose width/height no longer matched their points.`);

// Labels last, once every container is where it is finally going to be: the
// re-route above moves arrows, and an arrow that moves takes its label with it.
const settled = (await json(`${baseUrl}/api/elements${boardQuery}`)).elements;
const moves = recentreBoundTexts(settled);
for (const move of moves) {
  await put(move.id, { x: move.x, y: move.y });
}
if (moves.length > 0) {
  const worstMove = Math.max(...moves.map((move) => move.distance));
  console.log(
    `Put ${moves.length} bound text element(s) back on the thing they label ` +
    `(the furthest had ${Math.round(worstMove)}px to travel).`
  );
}

const after = (await json(`${baseUrl}/api/elements${boardQuery}`)).elements;
const stillWrong = planLabelRepair(after);
const stillStray = boundTextDrift(after);
const perContainer = {};
for (const el of after) {
  if (el.type !== 'text' || !el.containerId) continue;
  perContainer[el.containerId] = (perContainer[el.containerId] ?? 0) + 1;
}
const worst = Math.max(0, ...Object.values(perContainer));
console.log(
  `\nBoard now holds ${after.length} elements; ` +
  `most bound texts on any one container: ${worst}; ` +
  `containers still duplicated: ${stillWrong.duplicates.length}; ` +
  `labels still adrift: ${stillStray.length}.`
);
if (moves.length > 0) {
  console.log('The note on disk is unchanged until you save: `./bin/canvas board save --board <name>`.');
}
process.exit(stillWrong.duplicates.length === 0 && stillStray.length === 0 ? 0 : 1);
