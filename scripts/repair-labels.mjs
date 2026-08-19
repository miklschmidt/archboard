#!/usr/bin/env node
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
//
// Usage:
//   node scripts/repair-labels.mjs [--url URL] [--board KEY] [--dry-run]
//   node scripts/repair-labels.mjs --file scene.excalidraw [--out repaired.excalidraw]
//
// The file form repairs a saved scene (steps 1 and 2 only — reconstructing
// arrow geometry needs the board's own bindings resolved, which is the
// server's job). Default URL is EXPRESS_SERVER_URL or http://127.0.0.1:3000.

import { readFileSync, writeFileSync } from 'node:fs';
import { planLabelRepair } from '../dist/core/labels.js';

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
}

async function json(path, init) {
  const response = await fetch(path, init);
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
  if (dryRun || plan.removeIds.length === 0) process.exit(0);

  const doomed = new Set(plan.removeIds);
  const rebind = new Map(plan.rebind.map((entry) => [entry.id, entry.boundElements]));
  scene.elements = elements
    .filter((el) => !doomed.has(el.id))
    .map((el) => (rebind.has(el.id) ? { ...el, boundElements: rebind.get(el.id) } : el));

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
// itself, but they are entirely recoverable from what it connects: the server
// recomputes them from `start`/`end` whenever a bound shape's geometry is
// touched. So give every arrow those refs — browser-synced arrows carry the
// same fact as startBinding/endBinding — and then re-state each anchor shape's
// own x, which is a no-op for the shape and a reroute for its arrows.
const byId = new Map(elements.map((el) => [el.id, el]));
const anchors = new Set();
let refsAdded = 0;

for (const el of elements) {
  if (el.type !== 'arrow' && el.type !== 'line') continue;
  const start = el.start?.id ?? el.startBinding?.elementId;
  const end = el.end?.id ?? el.endBinding?.elementId;
  const patch = {};
  if (start && byId.has(start) && !el.start?.id) patch.start = { id: start };
  if (end && byId.has(end) && !el.end?.id) patch.end = { id: end };
  if (Object.keys(patch).length > 0) {
    await put(el.id, patch);
    refsAdded += 1;
  }
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
    `Restored ${refsAdded} arrow binding ref(s) and rerouted every arrow anchored to ` +
    `${anchors.size} shape(s).`
  );
}

// The re-router writes points and leaves width/height as it found them, which
// on a mangled arrow is the hairline nobody could grab. They are not a second
// opinion about the shape — they are the bounding box of the points — so state
// them again from the points the server just computed.
const rerouted = (await json(`${baseUrl}/api/elements${boardQuery}`)).elements;
let resized = 0;
for (const el of rerouted) {
  if (el.type !== 'arrow' && el.type !== 'line') continue;
  if (!Array.isArray(el.points) || el.points.length === 0) continue;
  const xs = el.points.map((p) => p[0]);
  const ys = el.points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (Math.abs((el.width ?? 0) - width) < 0.5 && Math.abs((el.height ?? 0) - height) < 0.5) continue;
  await put(el.id, { width, height });
  resized += 1;
}
if (resized > 0) console.log(`Re-measured ${resized} arrow(s) whose width/height no longer matched their points.`);

const after = (await json(`${baseUrl}/api/elements${boardQuery}`)).elements;
const stillWrong = planLabelRepair(after);
const perContainer = {};
for (const el of after) {
  if (el.type !== 'text' || !el.containerId) continue;
  perContainer[el.containerId] = (perContainer[el.containerId] ?? 0) + 1;
}
const worst = Math.max(0, ...Object.values(perContainer));
console.log(
  `\nBoard now holds ${after.length} elements; ` +
  `most bound texts on any one container: ${worst}; ` +
  `containers still duplicated: ${stillWrong.duplicates.length}.`
);
process.exit(stillWrong.duplicates.length === 0 ? 0 : 1);
