#!/usr/bin/env bun

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
import { withDoing } from './lib/doing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (p) => join(__dirname, '..', 'src', p);

const {
  extentOf,
  measureLinear,
  remeasureLinear,
  isPathElement,
  validateRenderGeometry
} = await import(src('core/geometry.ts'));
const { boxOf, boundingBoxOf, clusterBoxes, regionName } = await import(src('core/layout.ts'));
const { describeScene, buildSelectionReport } = await import(src('core/describe.ts'));
const { labelAnchorOf } = await import(src('core/labels.ts'));
const { compareBoards } = await import(src('core/compare.ts'));
const { planPromotion } = await import(src('core/promote.ts'));
const { expandElements } = await import(src('core/expand-elements.ts'));
const { BOUND_ARROW_GAP, boundEndpoint, focusPointOf } = await import(src('core/arrow-binding.ts'));

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

// Render geometry is a document invariant, separate from the forgiving
// measurements below. A missing coordinate may be useful as zero to a layout
// reader, but it is not a document Excalidraw can safely render.
{
  let error = null;
  try {
    validateRenderGeometry([
      { id: 'helvetica', type: 'text', fontFamily: 2, x: 10, y: 20, text: 'unmeasurable' },
      { id: 'bad-box', type: 'rectangle', x: Number.POSITIVE_INFINITY, y: Number.NaN, width: 80, height: undefined },
      // Tombstones are not rendered and must not make an otherwise valid
      // document impossible to save.
      { id: 'old', type: 'text', isDeleted: true, x: Number.NaN }
    ]);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, 'missing and non-finite render geometry should be refused');
  assert(
    error?.message.includes('helvetica (text): width, height'),
    `the Helvetica refusal should name its id, type and both fields: ${error?.message}`
  );
  assert(
    error?.message.includes('bad-box (rectangle): x, y, height'),
    `the refusal should report every bad field on every live element: ${error?.message}`
  );
  assert(!error?.message.includes('old'), `a deleted element was treated as renderable: ${error?.message}`);

  let valid = true;
  try {
    validateRenderGeometry([
      { id: 'point', type: 'rectangle', x: -10, y: 0, width: 0, height: 0 }
    ]);
  } catch {
    valid = false;
  }
  assert(valid, 'finite zero and negative geometry should remain valid');
}

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

// ─── The binding, which is where a bound arrow ends ──────────
//
// An arrow that touches a shape records which shape, how far round it
// (`focus`) and how far short of its outline it stops (`gap`). The server
// re-routes such an arrow whenever an agent moves either shape, and until
// TASK-088 it read none of that: it read the agent's own `start`/`end` refs,
// went centre to centre and stopped 8px short of a shape whose binding said 4.
// Below is the arithmetic those three numbers stand for, ported from
// Excalidraw's `determineFocusPoint` and `updateBoundPoint`.
{
  const box = { type: 'rectangle', x: 0, y: 0, width: 100, height: 60 };
  const fromTheRight = { x: 500, y: 30 };
  const binding = (over = {}) => ({ elementId: 'box', focus: 0, gap: BOUND_ARROW_GAP, fixedPoint: null, ...over });

  // `focus: 0` is the centre, which is why a centred arrow runs centre to
  // centre. That is the only case the old routing could ever have got right.
  const centred = focusPointOf(box, 0, fromTheRight);
  assert(centred.x === 50 && centred.y === 30,
    `focus 0 aims at ${centred.x},${centred.y} rather than the shape's centre`);

  // At the extremes the aim is a corner, and the sign says which. Seen from
  // the right, +1 is the near bottom corner and -1 the near top one, so the
  // two together are what an arrow leaving a box low and one leaving it high
  // are actually recording.
  const low = focusPointOf(box, 1, fromTheRight);
  const high = focusPointOf(box, -1, fromTheRight);
  assert(low.x === 100 && low.y === 60, `focus 1 aims at ${low.x},${low.y}, not the bottom-right corner`);
  assert(high.x === 100 && high.y === 0, `focus -1 aims at ${high.x},${high.y}, not the top-right corner`);

  // And the gap is the binding's own number rather than one this repo picked.
  const near4 = boundEndpoint(box, binding(), fromTheRight, { x: 0, y: 0 });
  assert(near(near4.x, 104) && near(near4.y, 30),
    `a gap of ${BOUND_ARROW_GAP} put the end at ${near4.x},${near4.y}, not 4px off the right edge`);
  const near12 = boundEndpoint(box, binding({ gap: 12 }), fromTheRight, { x: 0, y: 0 });
  assert(near(near12.x, 112),
    `a binding recording gap 12 was routed to ${near12.x}, which is not 12px off the edge at x=100`);
  assert(near12.x !== near4.x,
    'two bindings recording different gaps were routed to the same point, so the gap is being ignored');

  // A focused end is somewhere else entirely — near the corner it names, not
  // on the line between the two centres. This is the difference that undid a
  // person's arrow: routed centred, an end they had attached at a corner was
  // dragged into the middle of the side.
  const focused = boundEndpoint(box, binding({ focus: 1 }), fromTheRight, { x: 0, y: 0 });
  assert(near(focused.x, 104), `a focused end left the outline, at x=${focused.x}`);
  assert(focused.y > 50,
    `focus 1 was routed to y=${focused.y}, which is the centre line rather than the corner it aims at`);

  // Rotation is the shape's, so the ray is turned rather than the shape. A box
  // on its side is 60 wide, so its outline is 34px from its centre.
  const onItsSide = { ...box, angle: Math.PI / 2 };
  const rotated = boundEndpoint(onItsSide, binding(), fromTheRight, { x: 0, y: 0 });
  assert(near(rotated.x, 84) && near(rotated.y, 30),
    `a box rotated a quarter turn was routed to ${rotated.x},${rotated.y} rather than 84,30`);

  // An ellipse and a diamond are narrower than their bounding box on any
  // diagonal, so an arrow arriving at 45 degrees meets each of them somewhere
  // different — and neither of them where a rectangle would be met.
  const corner = { x: 500, y: 480 };
  const meets = (type) => boundEndpoint({ ...box, type }, binding(), corner, { x: 0, y: 0 });
  const [square, round, diamond] = ['rectangle', 'ellipse', 'diamond'].map(meets);
  assert(square.x > round.x && round.x > diamond.x,
    `arriving on a diagonal, the outlines should nest rectangle > ellipse > diamond, not ` +
    `${Math.round(square.x)} / ${Math.round(round.x)} / ${Math.round(diamond.x)}`);

  // Nothing is routed away from an end that starts inside the shape: there is
  // no outline between the two, so it lands on the aim.
  const fromInside = boundEndpoint(box, binding(), { x: 50, y: 30 }, { x: 7, y: 7 });
  assert(fromInside.x === 50 && fromInside.y === 30,
    `an end aimed from inside the shape went to ${fromInside.x},${fromInside.y} rather than the aim`);
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
  const expanded = expandElements([bent], { deterministic: true });
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
  const straightText = expandElements([straight], { deterministic: true })
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
// into one is a freedraw: a shape a user drew and then promoted.
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
// enough to make the connector supply the node's name.
{
  const box = { id: 'box', type: 'rectangle', x: 0, y: 0, width: 300, height: 120, label: { text: 'Payments' } };
  const arrow = { id: 'arrow', type: 'arrow', x: 400, y: 300, width: 5000, height: 5000,
    points: [[0, 0], [-40, -30]], label: { text: 'calls' } };
  const board = [box, arrow];
  const plan = planPromotion({ targets: board, board, kind: 'service', boardVariant: 'current' });
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
  const server = spawn(process.execPath, [src('server.ts')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ARCHBOARD_VAULT: vault, LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  const api = async (method, url, body) => {
    // Every write says what it is doing, once for the whole check (TASK-095,
    // scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
    url = withDoing(url, method, 'checking where an arrow goes');
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

    // And a caller explicitly re-pointing an arrow: the path is the statement,
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

    // The selection report is the other reader a user meets directly: select
    // an arrow in the scene and this is what the agent is told is selected.
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

    // --- what an arrow touches, and who gets to say so ----------------------
    //
    // The failure this reproduces was measured, not reasoned about
    // (`scripts/probe-arrow-refs.mjs`). An agent draws an arrow A -> B. A
    // person drags the tail off A and onto C, which is a statement about the
    // design and the whole reason the board is shared. An agent then moves A,
    // which the arrow no longer touches, and the server dragged the arrow back
    // — because it routed by the agent's `start` ref, which still said A and
    // which nothing in the browser has ever heard of.
    //
    // Its own board, so the scene above keeps the assertions written against
    // it.
    await api('POST', '/api/boards/new', { board: 'wires' });
    const wires = '?board=wires';
    const wiresOn = async () => (await api('GET', `/api/elements${wires}`))?.elements ?? [];
    const wire = async (id) => (await wiresOn()).find((el) => el.id === id);
    const path = (el) => JSON.stringify(el.points);
    const at = (el, index) => ({ x: el.x + el.points[index][0], y: el.y + el.points[index][1] });

    await api('POST', `/api/elements/batch${wires}`, {
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 60, label: { text: 'A' } },
        { id: 'b', type: 'rectangle', x: 400, y: 0, width: 100, height: 60, label: { text: 'B' } },
        { id: 'c', type: 'rectangle', x: 0, y: 300, width: 100, height: 60, label: { text: 'C' } },
        { id: 'arr', type: 'arrow', x: 100, y: 30, points: [[0, 0], [300, 0]], start: { id: 'a' }, end: { id: 'b' } },
        // Drawn with a bend in it, which is what the skill recommends for
        // routing round something.
        { id: 'bent', type: 'arrow', x: 100, y: 30, points: [[0, 0], [250, -220], [300, 0]], start: { id: 'a' }, end: { id: 'b' } }
      ]
    });

    // The refs are an input format and the board does not keep them, exactly as
    // it stopped keeping `label` in TASK-073. What it keeps is the binding.
    const drawnArr = await wire('arr');
    assert(drawnArr.start === undefined && drawnArr.end === undefined,
      "an arrow's `start`/`end` refs were stored, so the board holds two answers to what it touches");
    assert(drawnArr.startBinding?.elementId === 'a' && drawnArr.endBinding?.elementId === 'b',
      'the refs were not converted into the binding that replaces them');
    assert(near(drawnArr.x, 100 + BOUND_ARROW_GAP),
      `a bound arrow starts ${Math.round(drawnArr.x - 100)}px off box A, not the ` +
      `${BOUND_ARROW_GAP} its own binding records`);

    // A bend is a decision. Moving a shape the arrow is bound to moves the end
    // that touches it and nothing else; the old routing overwrote every path
    // with a straight line between two boxes.
    const bentBefore = await wire('bent');
    const bendBefore = at(bentBefore, 1);
    await api('PUT', `/api/elements/b${wires}`, { x: 400, y: -200 });
    const bentAfter = await wire('bent');
    assert(bentAfter.points.length === 3,
      `moving a box flattened a three-point arrow to ${bentAfter.points.length} points`);
    const bendAfter = at(bentAfter, 1);
    assert(near(bendAfter.x, bendBefore.x, 1) && near(bendAfter.y, bendBefore.y, 1),
      `the bend moved from ${Math.round(bendBefore.x)},${Math.round(bendBefore.y)} to ` +
      `${Math.round(bendAfter.x)},${Math.round(bendAfter.y)}`);
    assert(!near(at(bentAfter, 2).y, at(bentBefore, 2).y, 1),
      'the check is not exercising anything: the end bound to the box that moved should have followed it');

    // Now the failure. A person drags the tail onto C: Excalidraw rewrites
    // `startBinding` and the points, and reports them.
    const rebound = {
      ...(await wire('arr')),
      startBinding: { elementId: 'c', focus: 0, gap: BOUND_ARROW_GAP, fixedPoint: null },
      points: [[0, 0], [300, -270]]
    };
    await api('POST', `/api/elements/changes${wires}`, { upserts: [rebound], deletes: [], clientId: 'a-person' });
    const asLeft = await wire('arr');
    assert(asLeft.startBinding?.elementId === 'c', "the person's re-bind did not reach the board");

    // An agent moves A, which the arrow has not touched since.
    await api('PUT', `/api/elements/a${wires}`, { x: 0, y: -200 });
    const afterUnrelatedMove = await wire('arr');
    assert(path(afterUnrelatedMove) === path(asLeft),
      `moving a shape the arrow no longer touches dragged it from ${path(asLeft)} to ` +
      `${path(afterUnrelatedMove)}, undoing where a person put it`);

    // The same thing said the other way: an end dragged into empty space is
    // bound to nothing, and nothing is what should move it.
    const loosened = {
      ...(await wire('arr')),
      endBinding: null,
      points: [[0, 0], [900, 900]]
    };
    await api('POST', `/api/elements/changes${wires}`, { upserts: [loosened], deletes: [], clientId: 'a-person' });
    const loose = await wire('arr');
    assert(loose.endBinding === null, 'unbinding an arrow end did not reach the board');
    await api('PUT', `/api/elements/b${wires}`, { x: 900, y: 400 });
    assert(path(await wire('arr')) === path(loose),
      'moving the box an arrow end was dragged off pulled the loose end back to it');

    // And the numbers a person's own arrow carries are honoured, which is what
    // makes re-routing one safe at all. This one attaches low on box D and
    // further out than archboard's own arrows do.
    await api('POST', `/api/elements/batch${wires}`, {
      elements: [{ id: 'd', type: 'rectangle', x: 1000, y: 1000, width: 200, height: 100 }]
    });
    await api('POST', `/api/elements/changes${wires}`, {
      upserts: [{
        id: 'user-arrow', type: 'arrow', x: 1400, y: 1120, width: 179, height: 50,
        points: [[0, 0], [-179, -50]],
        startBinding: null,
        endBinding: { elementId: 'd', focus: 0.9, gap: 15, fixedPoint: null }
      }],
      deletes: [],
      clientId: 'a-person'
    });
    const userDrawn = await wire('user-arrow');
    assert(userDrawn.endBinding?.gap === 15 && userDrawn.endBinding?.focus === 0.9,
      "the person's own focus and gap did not survive the report");

    // Where a binding says an end belongs, on an outline `gap` out from the
    // shape. A person dragging this end in a browser would have been given
    // this point by Excalidraw; the report above is a fixture, so one write
    // settles it there first and everything after compares against that.
    const onOutline = (end, box) => Math.max(
      Math.abs(end.x - (box.x + box.width / 2)) / (box.width / 2 + 15),
      Math.abs(end.y - (box.y + box.height / 2)) / (box.height / 2 + 15)
    );
    const asDropped = at(userDrawn, 1);
    await api('PUT', `/api/elements/d${wires}`, { x: 1000, y: 1000 });
    const settledEnd = at(await wire('user-arrow'), 1);
    assert(near(onOutline(settledEnd, { x: 1000, y: 1000, width: 200, height: 100 }), 1, 0.02),
      `the end sits at ${onOutline(settledEnd, { x: 1000, y: 1000, width: 200, height: 100 }).toFixed(2)} ` +
      "of the outline the binding's own gap of 15 draws, not on it");
    // Against where a centred binding would have put the same end, which is
    // the only thing the old routing could say and is 30px away from where
    // this person attached theirs.
    const settledArrow = await wire('user-arrow');
    const centred = boundEndpoint(
      { type: 'rectangle', x: 1000, y: 1000, width: 200, height: 100 },
      { elementId: 'd', focus: 0, gap: 15, fixedPoint: null },
      at(settledArrow, 0),
      settledEnd
    );
    assert(Math.hypot(settledEnd.x - centred.x, settledEnd.y - centred.y) > 10,
      `focus 0.9 was routed to ${Math.round(settledEnd.y)}, which is where focus 0 puts it ` +
      '(a centred path), rather than low on the box where it was attached');
    assert(near(settledEnd.x, asDropped.x, 10),
      'the check is not exercising anything: routing moved the end right across the box');

    // Nudge D and put it back. The arrow's other end never moved, so an end
    // routed from its binding lands exactly where it was — which is the whole
    // claim, that re-routing an arrow a person drew leaves it where they drew
    // it.
    await api('PUT', `/api/elements/d${wires}`, { x: 1040, y: 1030 });
    const nudged = at(await wire('user-arrow'), 1);
    assert(!near(nudged.x, settledEnd.x, 1) || !near(nudged.y, settledEnd.y, 1),
      'moving the box did not re-route the arrow bound to it');
    assert(near(onOutline(nudged, { x: 1040, y: 1030, width: 200, height: 100 }), 1, 0.02),
      'the re-routed end left the outline the binding describes');

    await api('PUT', `/api/elements/d${wires}`, { x: 1000, y: 1000 });
    const restored = at(await wire('user-arrow'), 1);
    assert(near(restored.x, settledEnd.x, 0.5) && near(restored.y, settledEnd.y, 0.5),
      `putting the box back left the arrow at ${Math.round(restored.x)},${Math.round(restored.y)} ` +
      `rather than the ${Math.round(settledEnd.x)},${Math.round(settledEnd.y)} its binding puts it at`);
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
