#!/usr/bin/env node

// Where an arrow is, according to everything that reads the board.
//
// An Excalidraw arrow stores an origin and a path: `x, y` is its FIRST POINT
// and `points` are offsets from it, free to run negative. So for an arrow
// drawn leftwards or upwards the range `x .. x + width` is the board the arrow
// came from, not the board it covers, and for one drawn up and to the left the
// two do not overlap at all. Every reader here used to assume top-left plus
// size: the scene bounding box, and through layout.ts the cluster, region and
// relative-direction signals that `describe` and `compare` report — which are
// what an agent narrates back when a human rearranges the board (TASK-038).
//
// Compounding it, the server wrote an arrow's points on every re-route and
// left `width` and `height` as it found them, so a moved arrow was recorded at
// the size it used to be. `scripts/repair-labels.mjs` had been quietly
// re-measuring since TASK-024, which is why nobody saw it.
//
// Two halves below. The first is arithmetic and needs nothing. The second
// builds a real board on a real server, out of arrows that run leftwards,
// upwards, and both at once, and reads it back the way the product does.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = (p) => join(__dirname, '..', 'dist', p);

const { extentOf, measureLinear, remeasureLinear, isPathElement } = await import(dist('core/geometry.js'));
const { boxOf, boundingBoxOf, clusterBoxes, regionName } = await import(dist('core/layout.js'));
const { describeScene, buildSelectionReport } = await import(dist('core/describe.js'));
const { labelAnchorOf } = await import(dist('core/labels.js'));
const { compareBoards } = await import(dist('core/compare.js'));
const { planPromotion } = await import(dist('core/promote.js'));
const { expandElementsForExport } = await import(dist('core/expand-elements.js'));

let failures = 0;
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
};
const near = (a, b, slack = 0.5) => Math.abs(a - b) <= slack;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── The arithmetic ──────────────────────────────────────────

// The four directions an arrow can be drawn in, all of them 300x200, all of
// them covering exactly the square from (200,300) to (500,500). Only the
// origin moves — which is the whole point: four elements whose stored `x, y`
// are four different corners and which are the same arrow on screen.
const arrows = {
  'right and down': { type: 'arrow', x: 200, y: 300, points: [[0, 0], [300, 200]] },
  'left and down': { type: 'arrow', x: 500, y: 300, points: [[0, 0], [-300, 200]] },
  'right and up': { type: 'arrow', x: 200, y: 500, points: [[0, 0], [300, -200]] },
  'left and up': { type: 'arrow', x: 500, y: 500, points: [[0, 0], [-300, -200]] }
};

for (const [name, arrow] of Object.entries(arrows)) {
  const extent = extentOf(arrow);
  assert(
    near(extent.x, 200) && near(extent.y, 300) && near(extent.width, 300) && near(extent.height, 200),
    `an arrow running ${name} covers (200,300) 300x200, not ${JSON.stringify(extent)}`
  );
}

// The one the old formula got backwards, stated on its own so the check says
// what the bug was: negative in both axes, and its stored origin is the
// far corner of the box it covers.
{
  const arrow = arrows['left and up'];
  const extent = extentOf(arrow);
  assert(
    arrow.x >= extent.x + extent.width && arrow.y >= extent.y + extent.height,
    'the check is not exercising the bug: this arrow should start at the far corner of the box it covers'
  );
  assert(
    boundingBoxOf([boxOf(arrow)]).maxX === 500 && boundingBoxOf([boxOf(arrow)]).minX === 200,
    `a frame drawn round one leftward arrow is the arrow: ${JSON.stringify(boundingBoxOf([boxOf(arrow)]))}`
  );
}

// A bent path is measured over every point, not over its endpoints: an arrow
// routed round an obstacle covers the detour too.
{
  const bent = { type: 'arrow', x: 0, y: 0, points: [[0, 0], [-40, -90], [60, 10], [10, 40]] };
  const extent = extentOf(bent);
  assert(
    extent.x === -40 && extent.y === -90 && extent.width === 100 && extent.height === 130,
    `a bent path is measured over all of it, not ${JSON.stringify(extent)}`
  );
}

// A path decides, not a type name. Freedraw stores a stroke the same way an
// arrow stores a path, so a stroke drawn up and to the left is placed by the
// same rule and a linear type nobody has added yet is right by default.
{
  const stroke = { type: 'freedraw', x: 900, y: 900, points: [[0, 0], [-50, -60], [-10, -20]] };
  assert(isPathElement(stroke), 'a freedraw stroke carries a path');
  const extent = extentOf(stroke);
  assert(extent.x === 850 && extent.y === 840 && extent.width === 50 && extent.height === 60,
    `a freedraw stroke is measured from its stroke, not ${JSON.stringify(extent)}`);
}

// Everything without a path keeps the answer it already had.
{
  const box = { type: 'rectangle', x: 10, y: 20, width: 200, height: 100 };
  const extent = extentOf(box);
  assert(extent.x === 10 && extent.y === 20 && extent.width === 200 && extent.height === 100,
    'a box is its own extent');
  assert(!isPathElement(box), 'a rectangle carries no path');
  assert(extentOf({ type: 'arrow', x: 5, y: 6, points: [] }).width === 0,
    'an arrow with no path falls back to its stored size');
  assert(remeasureLinear(box) === undefined, 'there is nothing to re-measure about a rectangle');
}

// measureLinear and remeasureLinear: the size of a path, and whether the
// element already says so.
{
  assert(measureLinear([[0, 0], [-300, -200]]).width === 300, 'a leftward path is 300 wide, not -300');
  assert(measureLinear(undefined) === undefined, 'no path, no measurement');
  const stale = { type: 'arrow', x: 500, y: 500, width: 10, height: 10, points: [[0, 0], [-300, -200]] };
  const fixed = remeasureLinear(stale);
  assert(fixed?.width === 300 && fixed?.height === 200,
    `a stale arrow re-measures to 300x200, not ${JSON.stringify(fixed)}`);
  const settled = { ...stale, width: 300.2, height: 199.9 };
  assert(remeasureLinear(settled) === undefined,
    'a fifth of a pixel is not a resize, and saying it is wakes the change feed for nothing');
}

// ─── The exported label ──────────────────────────────────────
//
// Expanding a board for export invents the bound text element an arrow's
// label needs, and has to put it where Excalidraw would. Halfway down the
// first segment is that place only for a two-point arrow, and the skill
// recommends waypoints for routing round obstacles (TASK-044).
{
  const bent = {
    id: 'bent', type: 'arrow', x: 100, y: 100, width: 300, height: 200,
    points: [[0, 0], [300, 0], [300, 200]], label: { text: 'routes via' }
  };
  const expanded = expandElementsForExport([bent], { deterministic: true });
  const text = expanded.find((el) => el.type === 'text');
  assert(text !== undefined, 'expanding a labelled arrow should have produced a bound text element');
  // Three points, so Excalidraw hangs the label on the middle vertex: the
  // corner at (400,100). Halfway down the first segment is (250,100), and
  // halfway to the last point is (250,200) — neither is on the arrow's bend.
  const centre = { x: text.x + text.width / 2, y: text.y + text.height / 2 };
  const anchor = labelAnchorOf(bent);
  assert(near(centre.x, 400, 1) && near(centre.y, 100, 1),
    `a three-point arrow labels itself at its bend (400,100), not (${centre.x},${centre.y})`);
  assert(near(centre.x, anchor.x, 1) && near(centre.y, anchor.y, 1),
    'the exported label and the placement rule the server enforces should agree');

  // A plain two-point arrow keeps the answer it always had, so this is a fix
  // and not a move.
  const straight = {
    id: 'straight', type: 'arrow', x: 0, y: 0, width: 200, height: 100,
    points: [[0, 0], [200, 100]], label: { text: 'calls' }
  };
  const straightText = expandElementsForExport([straight], { deterministic: true })
    .find((el) => el.type === 'text');
  assert(near(straightText.x + straightText.width / 2, 100, 1) &&
    near(straightText.y + straightText.height / 2, 50, 1),
    'a two-point arrow still labels itself halfway along');
}

// ─── The diff and the naming ─────────────────────────────────
//
// `compare` and `promote` are pure over an array of elements, so they can be
// asked directly. Both used to read a box off `x, y, width, height`, and both
// decide something a human hears: what a node's geometry is, where a plain
// element sits, and which shape the node is named after.

// A connector never joins a node group, so the element that carries a path
// into one is a freedraw: a shape somebody drew by hand and then promoted.
// Both strokes below run up and to the left, so each stores an origin that is
// the far corner of the board it covers.
{
  const node = (id, name) => ({ archboard: { node: id, kind: 'service', name } });
  const elements = [
    // `hub` is a small box with a stroke reaching out of it. The stroke's
    // origin is 1100px away from the box; its far end lands on it.
    { id: 'hub-box', type: 'rectangle', x: 300, y: 250, width: 200, height: 100,
      label: { text: 'Hub' }, customData: node('hub', 'Hub') },
    { id: 'hub-stroke', type: 'freedraw', x: 1600, y: 1200, width: 1300, height: 950,
      points: [[0, 0], [-1300, -950]], customData: node('hub', 'Hub') },
    // `stale` carries a size its path does not agree with, which is what any
    // board written before the server started re-measuring holds. Measured, it
    // is a scratch of 40x30 next to a 300x120 box; taken at its word it is the
    // biggest thing on the board and speaks for the node.
    { id: 'stale-box', type: 'rectangle', x: 3000, y: 3000, width: 300, height: 120,
      label: { text: 'Payments' }, customData: node('stale', 'Payments') },
    { id: 'stale-stroke', type: 'freedraw', x: 3400, y: 3300, width: 5000, height: 5000,
      points: [[0, 0], [-40, -30]], customData: node('stale', 'Payments') },
    { id: 'far-box', type: 'rectangle', x: 5000, y: 5000, width: 200, height: 100,
      label: { text: 'Far' }, customData: node('far', 'Far') },
    // Not promoted and not a connector, so it is a plain element, and it
    // carries a path — plain elements are placed by the same rule or not at all.
    { id: 'scribble', type: 'freedraw', x: 5000, y: 5000, width: 4500, height: 4400,
      points: [[0, 0], [-4500, -4400]], label: { text: 'note' } }
  ];
  const identity = { board: 'geometry', variant: 'current' };
  const side = { key: 'geometry', identity, elements, source: 'memory' };
  const result = compareBoards(side, { ...side, key: 'geometry@copy' });
  const factsFor = (id) => result.nodes.unchanged.find((n) => n.node === id)?.facts;

  const hub = factsFor('hub');
  assert(hub !== undefined, 'compare should have found the hub node');
  // (300,250) to (1600,1200): the box plus the stroke that reaches it. Read
  // the old way the node is 2600x1900 and most of it is board nobody drew on.
  assert(hub.cosmetic.width === 1300 && hub.cosmetic.height === 950,
    `a node holding a leftward stroke is 1300x950, not ${hub.cosmetic.width}x${hub.cosmetic.height}`);
  // Two elements that touch are one place. Measured by origin the stroke sits
  // 1100px from its own box, and compare warns a human about a node that is
  // not scattered at all.
  const scattered = result.warnings.filter((w) => w.includes('separate places'));
  assert(scattered.length === 0,
    `nothing here is scattered, but compare said so: ${scattered.join(' / ')}`);

  // The node's primary is what the node is reported as being. A stale size on
  // a scratch is enough to make the scratch speak for the box.
  const stale = factsFor('stale');
  assert(stale?.cosmetic.type === 'rectangle',
    `the node should be reported as the box it is, not as a ${stale?.cosmetic.type}`);

  // Whereabouts. The stroke is drawn back across the middle of the board;
  // its origin is off the bottom-right corner of everything.
  const scribble = result.plain.to.labelled.find((p) => p.id === 'scribble');
  assert(scribble !== undefined, 'compare should have reported the labelled freedraw');
  assert(scribble.region === 'centre',
    `a stroke drawn back across the board is in the centre, not the ${scribble.region} where its origin is`);
}

// Naming a node: the biggest labelled shape is the one a human would read, so
// "biggest" has to be measured. A stale size is exactly what an arrow carries
// on any board written before the server started re-measuring, and it is
// enough to hand the node's name to the connector.
{
  const box = { id: 'box', type: 'rectangle', x: 0, y: 0, width: 300, height: 120, label: { text: 'Payments' } };
  const arrow = { id: 'arrow', type: 'arrow', x: 400, y: 300, width: 5000, height: 5000,
    points: [[0, 0], [-40, -30]], label: { text: 'calls' } };
  const board = [box, arrow];
  const plan = planPromotion({ targets: board, board, kind: 'service' });
  assert(plan.nodes.length === 1 && plan.nodes[0].name === 'Payments',
    `promoting a box and an arrow names the node after the box, not "${plan.nodes[0]?.name}"`);
}

// ─── The board ───────────────────────────────────────────────
//
// A real server, real bound arrows, and the readers that carry the product.

{
  // A different port each run, so two checkouts running the suite at once do
  // not serialise on one, and so this never lands on somebody's real canvas.
  const PORT = 37000 + Math.floor(Math.random() * 2000);
  const base = `http://127.0.0.1:${PORT}`;
  const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-geometry-'));
  const server = spawn(process.execPath, [dist('server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  const api = async (method, url, body) => {
    const response = await fetch(`${base}${url}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
    return response.json().catch(() => null);
  };
  const board = '?board=scratch';
  const elementsOn = async () => (await api('GET', `/api/elements${board}`))?.elements ?? [];
  const node = (id, name) => ({ archboard: { node: id, kind: 'service', name } });

  try {
    for (let i = 0; i < 100; i++) {
      try { await fetch(`${base}/health`); break; } catch { await sleep(100); }
    }

    // `hub` is the far corner. Every arrow leaves it, so every arrow runs
    // leftwards, upwards, or both, and every one of them stores an origin
    // that is outside the box it covers.
    await api('POST', `/api/elements/batch${board}`, {
      elements: [
        { id: 'hub', type: 'rectangle', x: 1600, y: 1200, width: 200, height: 100, label: { text: 'Hub' }, customData: node('hub', 'Hub') },
        { id: 'west', type: 'rectangle', x: 200, y: 1200, width: 200, height: 100, label: { text: 'West' }, customData: node('west', 'West') },
        { id: 'north', type: 'rectangle', x: 1600, y: 200, width: 200, height: 100, label: { text: 'North' }, customData: node('north', 'North') },
        { id: 'northwest', type: 'rectangle', x: 200, y: 200, width: 200, height: 100, label: { text: 'Northwest' }, customData: node('northwest', 'Northwest') },
        // Sized wrongly on purpose: what the caller asks for is a connection,
        // and the server works out the path. The size has to follow the path
        // it worked out rather than the one the caller guessed.
        { id: 'to-west', type: 'arrow', x: 1600, y: 1250, width: 10, height: 10, start: { id: 'hub' }, end: { id: 'west' } },
        { id: 'to-north', type: 'arrow', x: 1700, y: 1200, width: 10, height: 10, start: { id: 'hub' }, end: { id: 'north' } },
        { id: 'to-northwest', type: 'arrow', x: 1600, y: 1200, width: 10, height: 10, start: { id: 'hub' }, end: { id: 'northwest' } },
        // Bound to nothing and drawn off past the top-left corner of
        // everything else, so it is the element that decides where the scene
        // box ends — and the one a box built from `x .. x + width` cuts off.
        { id: 'stray', type: 'arrow', x: 200, y: 200, points: [[0, 0], [-400, -300]] }
      ]
    });

    const linearsOn = async () => (await elementsOn()).filter((el) => el.type === 'arrow' || el.type === 'line');
    const badlySized = (arrows) => arrows.filter((el) => remeasureLinear(el) !== undefined);

    const drawn = await linearsOn();
    assert(drawn.length === 4, `the board should hold four arrows, not ${drawn.length}`);
    assert(
      drawn.every((el) => el.points.some(([px, py]) => px < 0 || py < 0)),
      'the check is not exercising the bug: every arrow here should run leftwards or upwards'
    );
    assert(
      drawn.find((el) => el.id === 'to-northwest').points.some(([px, py]) => px < 0 && py < 0),
      'the up-and-left arrow should be negative in both axes'
    );
    assert(badlySized(drawn).length === 0,
      `${badlySized(drawn).length} arrow(s) were created at a size their points do not agree with: ` +
      badlySized(drawn).map((el) => `${el.id} ${el.width}x${el.height}`).join(', '));

    // A re-route is where the stale size came from: the server writes new
    // points for every arrow bound to a shape that moved.
    await api('PUT', `/api/elements/hub${board}`, { x: 2400, y: 1800 });
    const rerouted = await linearsOn();
    const bound = rerouted.filter((el) => el.id !== 'stray');
    assert(
      bound.every((el) => {
        const was = drawn.find((d) => d.id === el.id);
        return JSON.stringify(was.points) !== JSON.stringify(el.points);
      }),
      'moving the hub should have re-routed all three arrows bound to it'
    );
    assert(badlySized(rerouted).length === 0,
      `re-routing left ${badlySized(rerouted).length} arrow(s) at a stale size: ` +
      badlySized(rerouted).map((el) => `${el.id} ${el.width}x${el.height} vs ${JSON.stringify(remeasureLinear(el))}`).join(', '));

    // And a caller re-pointing an arrow by hand: the path is the statement,
    // the size follows it.
    await api('PUT', `/api/elements/to-west${board}`, { points: [[0, 0], [-900, -400]] });
    const repointed = (await linearsOn()).find((el) => el.id === 'to-west');
    assert(near(repointed.width, 900) && near(repointed.height, 400),
      `re-pointing an arrow left it ${repointed.width}x${repointed.height}, not 900x400`);

    // --- the scene bounding box contains every arrow ------------------------
    const scene = await elementsOn();
    const reported = /Bounding box: \((-?\d+), (-?\d+)\) to \((-?\d+), (-?\d+)\)/.exec(describeScene(scene));
    assert(reported !== null, 'describe did not report a bounding box');
    const [minX, minY, maxX, maxY] = reported.slice(1).map(Number);
    const outside = [];
    for (const el of scene) {
      if (!Array.isArray(el.points)) continue;
      for (const [px, py] of el.points) {
        const x = el.x + px;
        const y = el.y + py;
        if (x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1) outside.push(`${el.id} (${Math.round(x)},${Math.round(y)})`);
      }
    }
    assert(outside.length === 0,
      `the scene box (${minX},${minY})-(${maxX},${maxY}) crops ${outside.length} arrow point(s): ${outside.join(', ')}`);

    // And the box is no bigger than the board either, which is the other half
    // of the same mistake: a frame stretched to swallow an origin that is not
    // a corner crops nothing but frames empty canvas, and every screenshot
    // inherits it. Worked out here from the raw points rather than through the
    // helper under test, so the two are independent statements.
    const trueEdges = (el) => {
      if (!Array.isArray(el.points) || el.points.length === 0) {
        return { x0: el.x, y0: el.y, x1: el.x + (el.width || 0), y1: el.y + (el.height || 0) };
      }
      const xs = el.points.map(([px]) => el.x + px);
      const ys = el.points.map(([, py]) => el.y + py);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const edges = scene.map(trueEdges);
    assert(
      near(minX, Math.min(...edges.map((e) => e.x0)), 1) && near(minY, Math.min(...edges.map((e) => e.y0)), 1) &&
      near(maxX, Math.max(...edges.map((e) => e.x1)), 1) && near(maxY, Math.max(...edges.map((e) => e.y1)), 1),
      `the box is (${minX},${minY})-(${maxX},${maxY}) but the board runs ` +
      `(${Math.round(Math.min(...edges.map((e) => e.x0)))},${Math.round(Math.min(...edges.map((e) => e.y0)))})-` +
      `(${Math.round(Math.max(...edges.map((e) => e.x1)))},${Math.round(Math.max(...edges.map((e) => e.y1)))})`
    );

    // --- layout places the arrows where they are drawn ----------------------
    //
    // layout.ts is fed boxes, so this is the check that the boxes are right:
    // the same board, measured both ways, and only one of them agrees with
    // where the arrow is on screen.
    const frame = boundingBoxOf(scene.map(boxOf));
    const staleBox = (el) => ({ x: el.x, y: el.y, w: el.width || 0, h: el.height || 0 });
    const centreOf = (box) => ({ cx: box.x + box.w / 2, cy: box.y + box.h / 2 });

    const misnamed = [];
    for (const el of scene.filter((e) => e.type === 'arrow')) {
      // An arrow's midpoint is where Excalidraw hangs its label, which is the
      // one place on an arrow both sides already agree about.
      const drawnMid = labelAnchorOf(el);
      const measured = centreOf(boxOf(el));
      const assumed = centreOf(staleBox(el));
      assert(near(measured.cx, drawnMid.x, 1) && near(measured.cy, drawnMid.y, 1),
        `${el.id}: measured centre (${Math.round(measured.cx)},${Math.round(measured.cy)}) is not where the arrow is drawn (${Math.round(drawnMid.x)},${Math.round(drawnMid.y)})`);
      assert(Math.hypot(assumed.cx - drawnMid.x, assumed.cy - drawnMid.y) > 100,
        `${el.id}: top-left-plus-size happens to be right here, so this board is not exercising the bug`);
      const named = regionName(measured.cx, measured.cy, frame);
      if (named !== regionName(assumed.cx, assumed.cy, frame)) misnamed.push(`${el.id} is ${named}`);
    }
    // Being far out is not the same as being *reported* wrong, and region is
    // the signal a human hears. On this board it changes the answer.
    assert(misnamed.length > 0,
      'no arrow here changes region between the two ways of measuring, so this board proves nothing about region');

    // Clustering: an arrow sits with the shapes it connects, because that is
    // where a human sees it. Measured by its origin it joins whatever happens
    // to be at the corner it started from.
    const westArrow = scene.find((el) => el.id === 'to-north');
    const withNorth = clusterBoxes([
      { id: 'north', ...boxOf(scene.find((el) => el.id === 'north')) },
      { id: 'to-north', ...boxOf(westArrow) }
    ]);
    assert(withNorth.length === 1 && withNorth[0].length === 2,
      'the arrow into North clusters with North, because it reaches it');
    const stale = clusterBoxes([
      { id: 'north', ...boxOf(scene.find((el) => el.id === 'north')) },
      { id: 'to-north', ...staleBox(westArrow) }
    ]);
    assert(stale.length === 2,
      'the check is not exercising the bug: measured the old way the arrow should miss North entirely');

    // The selection report is the other reader a human meets directly: tap an
    // arrow on the Flip and this is what the agent is told it selected.
    const report = buildSelectionReport(
      { elementIds: ['to-northwest'], clientId: 'pane', at: new Date().toISOString() },
      scene,
      0
    );
    const selected = report.elements[0];
    const arrowBox = boxOf(scene.find((el) => el.id === 'to-northwest'));
    assert(near(selected.x, arrowBox.x, 1) && near(selected.y, arrowBox.y, 1) && near(selected.width, arrowBox.w, 1),
      `selecting a leftward arrow reported ${JSON.stringify(selected)} rather than the board it covers`);

    // --- asking what is in a region -----------------------------------------
    //
    // A second batch, off in its own corner of the board, so the assertions
    // above keep the scene they were written against.
    await api('POST', `/api/elements/batch${board}`, {
      elements: [
        // Runs leftwards across the region and starts well to the right of it.
        { id: 'crosser', type: 'arrow', x: 4000, y: 4000, points: [[0, 0], [-2000, 0]] },
        // Starts inside the region and leaves it.
        { id: 'starter', type: 'arrow', x: 2500, y: 4000, points: [[0, 0], [1500, 600]] },
        // A box overlapping the region whose top-left corner is outside it —
        // the same question, asked of something with no path at all.
        { id: 'wide-box', type: 'rectangle', x: 2000, y: 3800, width: 1000, height: 500 },
        // Nowhere near it.
        { id: 'elsewhere', type: 'rectangle', x: 9000, y: 9000, width: 100, height: 100 }
      ]
    });
    const inRegion = async () => {
      const query = 'x_min=2400&x_max=2600&y_min=3900&y_max=4100';
      const found = await api('GET', `/api/elements/search?board=scratch&${query}`);
      return new Set((found?.elements ?? []).map((el) => el.id));
    };
    const hits = await inRegion();
    assert(hits.has('crosser'),
      'an arrow drawn straight across the region should be found in it, wherever it started');
    assert(hits.has('starter'),
      'an arrow that begins in the region overlaps it, so it is found — by its extent, like everything else');
    assert(hits.has('wide-box'),
      'a box overlapping the region is in it, even though its top-left corner is not');
    assert(!hits.has('elsewhere'),
      'a box 6000px away is not in the region, and a filter that says it is filters nothing');
  } finally {
    server.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(vault, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} geometry checks failed`);
  process.exit(1);
}
console.log(`geometry: ${checks} checks passed`);
