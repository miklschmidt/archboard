#!/usr/bin/env bun

// Note-region checks for the Obsidian .excalidraw.md writer.
//
// The two properties every case asserts are load-bearing:
//   idempotent  two consecutive saves of an unchanged board are byte-identical
//   lossless    re-wrapping a note's own scene reproduces the note byte for byte
//
// and on top of them, the property this file exists for: a save regenerates
// the scene and nothing else, so markdown a human wrote outside the Drawing
// block survives (TASK-017).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel) => join(__dirname, '..', 'src', rel);
const { wrapSceneAsObsidianMd, extractSceneJsonFromObsidianMd } = await import(
  src('core/obsidian-md.ts')
);
const { mintId, derivedId, isBlockId } = await import(src('core/ids.ts'));
const { prepareElement } = await import(src('core/normalize.ts'));
const { buildScene } = await import(src('core/scene-io.ts'));

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

function scene(elements = []) {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'archboard-check',
    elements,
    appState: { viewBackgroundColor: '#ffffff' },
    files: {}
  };
}

const rectangle = {
  id: 'rect-one',
  type: 'rectangle',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  customData: { archboard: { node: 'probe', kind: 'service' } }
};

const text = {
  id: 'text-one',
  type: 'text',
  x: 10,
  y: 20,
  width: 100,
  height: 25,
  text: 'AuthService',
  originalText: 'AuthService'
};

// A text element whose own text is the plugin's heading: it lands in the
// generated "## Text Elements" section, where a careless region split would
// mistake it for the start of the data section and grow the file on every save.
const impostorText = {
  id: 'text-two',
  type: 'text',
  x: 0,
  y: 0,
  width: 100,
  height: 25,
  text: '# Excalidraw Data\n## Text Elements',
  originalText: '# Excalidraw Data\n## Text Elements'
};

// The properties, asserted the same way for every shape: writing the note
// again with itself as the destination must change nothing, and the scene must
// still come back out of it.
function checkStable(name, note, expectScene, expectedHeadings = 1) {
  const again = wrapSceneAsObsidianMd(expectScene, note);
  assert(again === note, `${name}: re-saving an unchanged board is not byte-identical`);
  const third = wrapSceneAsObsidianMd(expectScene, again);
  assert(third === again, `${name}: third save drifts`);
  let parsed;
  try {
    parsed = JSON.parse(extractSceneJsonFromObsidianMd(note));
  } catch (error) {
    assert(false, `${name}: scene no longer extractable: ${error.message}`);
    return;
  }
  assert(parsed.type === 'excalidraw', `${name}: extracted scene is not an excalidraw scene`);
  assert(
    parsed.elements.length === expectScene.elements.length,
    `${name}: extracted scene has ${parsed.elements.length} elements, expected ${expectScene.elements.length}`
  );
  assert(note.includes('\n# Excalidraw Data\n## Text Elements\n'), `${name}: data section shape is broken`);
  assert(/^---\n/.test(note), `${name}: note does not start with frontmatter`);
  // Only the data section's own heading is a *region* boundary; other
  // occurrences — quoted in prose, or the raw text of a text element — are
  // content, and content is exactly what must survive.
  assert(
    (note.match(/^# Excalidraw Data[ \t]*$/gm) || []).length === expectedHeadings,
    `${name}: expected ${expectedHeadings} "# Excalidraw Data" heading line(s)`
  );
}

// --- a note archboard creates from scratch ----------------------------------

const board = scene([rectangle, text]);
const fresh = wrapSceneAsObsidianMd(board);
assert(fresh.includes('Switch to EXCALIDRAW VIEW'), 'fresh: banner missing');
assert(fresh.endsWith('```\n%%'), 'fresh: note does not end with the closing comment marker');
assert(fresh.includes('AuthService ^text-one'), 'fresh: text element block reference missing');
checkStable('fresh', fresh, board);

// --- the original reproduction: prose above the data section ----------------

const PROSE = '## Why this shape\n\nWe split payments out because billing kept blocking on it.\n';
const withProse = fresh.replace('\n# Excalidraw Data\n', `\n${PROSE}\n# Excalidraw Data\n`);
const savedWithProse = wrapSceneAsObsidianMd(board, withProse);
assert(savedWithProse.includes(PROSE), 'prose above: human prose was destroyed by the save');
assert(savedWithProse === withProse, 'prose above: save is not lossless');
checkStable('prose above', savedWithProse, board);

// A changed board keeps the prose while the scene moves.
const moved = scene([{ ...rectangle, x: 999 }, text]);
const afterMove = wrapSceneAsObsidianMd(moved, withProse);
assert(afterMove.includes(PROSE), 'prose above: prose lost when the scene changed');
assert(afterMove.includes('"x": 999'), 'prose above: scene was not regenerated');
checkStable('prose above, scene changed', afterMove, moved);

// --- prose below the Drawing block ------------------------------------------

const TAIL = '\n\n## Follow-ups\n\nThe queue box is a guess.\n';
const withTail = fresh + TAIL;
const savedWithTail = wrapSceneAsObsidianMd(board, withTail);
assert(savedWithTail.includes(TAIL), 'prose below: trailing prose was destroyed by the save');
assert(savedWithTail === withTail, 'prose below: save is not lossless');
checkStable('prose below', savedWithTail, board);

// --- prose on both sides -----------------------------------------------------

const bothSides = withProse + TAIL;
const savedBothSides = wrapSceneAsObsidianMd(board, bothSides);
assert(savedBothSides === bothSides, 'prose both sides: save is not lossless');
checkStable('prose both sides', savedBothSides, board);

// --- prose that quotes the plugin's own headings ----------------------------

const QUOTED = [
  '## Note format',
  '',
  'A drawing note looks like this:',
  '',
  '````markdown',
  '# Excalidraw Data',
  '## Text Elements',
  'Label ^abc12345',
  '````',
  '',
  'Everything below `# Excalidraw Data` belongs to the plugin.',
  ''
].join('\n');
const withQuoted = fresh.replace('\n# Excalidraw Data\n', `\n${QUOTED}\n# Excalidraw Data\n`);
const savedQuoted = wrapSceneAsObsidianMd(board, withQuoted);
assert(savedQuoted.includes('````markdown'), 'quoted headings: fenced example was destroyed');
assert(savedQuoted === withQuoted, 'quoted headings: save is not lossless');
assert(
  (savedQuoted.match(/^# Excalidraw Data[ \t]*$/gm) || []).length === 2,
  'quoted headings: expected the quoted heading plus the real one'
);
checkStable('quoted headings', savedQuoted, board, 2);

// --- a text element that looks like the plugin's headings --------------------

const impostorBoard = scene([rectangle, impostorText]);
const impostorNote = wrapSceneAsObsidianMd(impostorBoard);
checkStable('impostor text element', impostorNote, impostorBoard, 2);
const impostorTwice = wrapSceneAsObsidianMd(impostorBoard, wrapSceneAsObsidianMd(impostorBoard, impostorNote));
assert(impostorTwice.length === impostorNote.length, 'impostor text element: note grew across saves');

// --- an empty note, and a note that is only frontmatter ----------------------

const fromEmpty = wrapSceneAsObsidianMd(board, '');
assert(fromEmpty === fresh, 'empty note: does not produce the default note');
checkStable('empty note', fromEmpty, board);

const fromFrontmatterOnly = wrapSceneAsObsidianMd(board, '---\naliases: [payments]\n---\n');
assert(fromFrontmatterOnly.includes('aliases: [payments]'), 'frontmatter-only: frontmatter lost');
assert(fromFrontmatterOnly.includes('Switch to EXCALIDRAW VIEW'), 'frontmatter-only: banner missing');
checkStable('frontmatter only', fromFrontmatterOnly, board);

// --- a plain prose note being turned into a board ----------------------------

const plain = '# Payments\n\nNotes I took before there was a diagram.\n';
const fromPlain = wrapSceneAsObsidianMd(board, plain);
assert(fromPlain.includes(plain), 'plain note: prose lost when adding the data section');
assert(fromPlain.includes('Switch to EXCALIDRAW VIEW'), 'plain note: banner not introduced');
assert(fromPlain.includes('excalidraw-plugin: parsed'), 'plain note: plugin frontmatter not introduced');
checkStable('plain note', fromPlain, board);

// --- a note whose banner the human deleted ----------------------------------
//
// Losslessness outranks tidiness: the banner is never re-injected into a note
// that already has a data section.
const bannerless = fresh.replace(/^==⚠.*⚠==\n\n\n/m, '');
const savedBannerless = wrapSceneAsObsidianMd(board, bannerless);
assert(!savedBannerless.includes('Switch to EXCALIDRAW VIEW'), 'bannerless: banner was re-injected');
assert(savedBannerless === bannerless, 'bannerless: save is not lossless');
checkStable('bannerless', savedBannerless, board);

// --- frontmatter still round-trips (TASK-002 must not regress) ---------------

const custom = fresh.replace('excalidraw-plugin: parsed', 'aliases:\n  - payments\nexcalidraw-plugin: parsed');
const savedCustom = wrapSceneAsObsidianMd(scene([rectangle]), custom, {
  frontmatter: [['archboard-board', 'payments']]
});
assert(savedCustom.includes('  - payments'), 'frontmatter: custom keys lost');
assert(savedCustom.includes('archboard-board: payments'), 'frontmatter: identity key not written');
checkStable('frontmatter round-trip', savedCustom, scene([rectangle]));

// --- ids: the writer has nothing to rename (TASK-069) ------------------------
//
// A text element's block id is its element id, and a block reference cannot
// hold more than eight characters, so a longer one has to be renamed on the
// way into a note. Renaming is the most dangerous act in the system: with a
// text editor open on a bound label, applying a document in which that element
// had been renamed discarded five typed characters with no error and no
// warning. So no id archboard mints is ever long enough to need it.

const idsOf = (elements) => elements.map((el) => el.id);
const idsInNote = (note) => idsOf(JSON.parse(extractSceneJsonFromObsidianMd(note)).elements);

{
  // A board the way the server builds one: a labelled shape, a labelled arrow
  // and a standalone text, through the same two functions `board save` uses.
  const drawn = [
    prepareElement({ type: 'rectangle', x: 0, y: 0, width: 200, height: 100, label: { text: 'AuthService' } }),
    prepareElement({ type: 'arrow', x: 0, y: 0, points: [[0, 0], [220, 0]], label: { text: 'HTTP' } }),
    prepareElement({ type: 'text', x: 0, y: 200, text: 'a note somebody left' })
  ];
  const { scene: built } = buildScene(drawn);
  const minted = idsOf(built.elements);
  assert(minted.length === 5, `server board: expected 5 elements after expansion, got ${minted.length}`);
  assert(
    minted.every(isBlockId),
    `server board: minted ids that cannot be block references — ${minted.filter((id) => !isBlockId(id)).join(', ')}`
  );

  const note = wrapSceneAsObsidianMd(built);
  const written = idsInNote(note);
  assert(
    written.join(',') === minted.join(','),
    `server board: saving renamed ids — ${minted.join(',')} became ${written.join(',')}`
  );
  // Renaming rewires references, so a stranded binding is the visible symptom.
  for (const el of JSON.parse(extractSceneJsonFromObsidianMd(note)).elements) {
    if (el.containerId) {
      assert(
        written.includes(el.containerId),
        `server board: text ${el.id} points at a container that is not in the note`
      );
      assert(
        note.includes(`^${el.id}`),
        `server board: bound text ${el.id} has no block reference in the note`
      );
    }
  }
  checkStable('server board', note, built);
}

{
  // The four ids measured in docs/design/server-is-the-truth.md §4, with the
  // renames the note writer gave them. Boards already in the vault were
  // written through that derivation, so it may not move: if it did, opening
  // one and saving it would rename every text element it holds.
  const measured = [
    ['text-plain', 'Koh9JpWT'],
    ['0fiCOql98KV5AVNsb7yti', 'QO4jtmur'],
    ['M0uzDDmr3XAuPV1LLV0qO', 'vbJqUUt6'],
    ['GOThTByyWuX7VIo4b-EbG', 'ct9GeNvu']
  ];
  for (const [before, after] of measured) {
    assert(derivedId(before) === after, `vault compatibility: ${before} now derives ${derivedId(before)}, not ${after}`);
  }

  // And end to end: a note written before this change, reopened and saved,
  // changes no id.
  const foreign = scene([
    { ...rectangle, id: 'M0uzDDmr3XAuPV1LLV0qO' },
    { ...text, id: '0fiCOql98KV5AVNsb7yti' },
    { ...impostorText, id: 'text-plain' }
  ]);
  const vaultNote = wrapSceneAsObsidianMd(foreign);
  const settled = idsInNote(vaultNote);
  assert(
    settled.join(',') === 'M0uzDDmr3XAuPV1LLV0qO,QO4jtmur,Koh9JpWT',
    `vault compatibility: unexpected ids in the note — ${settled.join(',')}`
  );
  const reopened = JSON.parse(extractSceneJsonFromObsidianMd(vaultNote));
  const resaved = idsInNote(wrapSceneAsObsidianMd(reopened, vaultNote));
  assert(
    resaved.join(',') === settled.join(','),
    `vault compatibility: opening and saving renamed something — ${settled.join(',')} became ${resaved.join(',')}`
  );
}

{
  // Collision handling is the mint's, not the note writer's: two ids that
  // derive the same block id get different ones, and a mint never returns an
  // id already spoken for.
  const taken = new Set(['Koh9JpWT']);
  const second = derivedId('text-plain', taken);
  assert(second !== 'Koh9JpWT', 'collision: derivedId handed out a name already taken');
  assert(isBlockId(second), `collision: the salted derivation is not a block id (${second})`);
  assert(derivedId('text-plain', taken) === second, 'collision: the salted derivation is not deterministic');

  // mintId is random, so the way to see the retry is to refuse the first few
  // it offers and check none of them came back.
  const refused = [];
  const fussy = { has: (id) => (refused.length < 3 ? (refused.push(id), true) : false) };
  const eventual = mintId(fussy);
  assert(refused.length === 3, `collision: mintId offered ${refused.length} ids before settling, expected 3`);
  assert(!refused.includes(eventual), 'collision: mintId returned an id it had been told was taken');

  const notBlockIds = Array.from({ length: 200 }, () => mintId()).filter((id) => !isBlockId(id));
  assert(notBlockIds.length === 0, `mintId produced ${notBlockIds.length} ids that are not block ids`);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} obsidian-md checks failed`);
  process.exit(1);
}
console.log(`obsidian-md: ${checks} checks passed`);
