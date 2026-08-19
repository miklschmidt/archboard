#!/usr/bin/env node

// Store checks for the stencil library.
//
// The properties that matter here are all about *not* undoing the human:
//
//   seed once      the curated sets are offered when they have never been
//                  offered, and never again — a stencil deleted stays deleted
//   idempotent id  the same curated item gets the same id on every machine, so
//                  installing that library from the site merges instead of
//                  duplicating
//   both formats   version 1 (`library: elements[][]`) and version 2
//                  (`libraryItems: [...]`) are still both published, and both
//                  have to read
//
// The vault is set before the import because config.ts captures
// ARCHBOARD_VAULT at module load; one temp vault serves the whole file.

import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const vault = fs.mkdtempSync(join(os.tmpdir(), 'archboard-library-'));
process.env.ARCHBOARD_VAULT = vault;

const {
  parseLibraryFile, curatedSets, readLibrary, writeLibrary, resetLibraryCache, libraryFilePath
} = await import(join(__dirname, '..', 'dist', 'core', 'library.js'));

let failures = 0;
let checks = 0;

function assert(condition, message) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

// --- both on-disk formats read ----------------------------------------------

const v1 = JSON.stringify({
  type: 'excalidrawlib',
  version: 1,
  library: [
    [{ id: 'a', type: 'rectangle' }, { id: 'b', type: 'text' }],
    [{ id: 'c', type: 'ellipse' }]
  ]
});
const v1Items = parseLibraryFile(v1, 'fixture');
assert(v1Items.length === 2, `v1: expected 2 items, got ${v1Items.length}`);
assert(v1Items[0].elements.length === 2, 'v1: elements not carried');
assert(v1Items[0].status === 'published', 'v1: default status is not published');
assert(v1Items[0].id !== v1Items[1].id, 'v1: two items share an id');
assert(
  parseLibraryFile(v1, 'fixture')[0].id === v1Items[0].id,
  'v1: ids are not deterministic — the same file would seed twice'
);
assert(
  parseLibraryFile(v1, 'other')[0].id !== v1Items[0].id,
  'v1: two different sets derive the same id'
);

const v2 = JSON.stringify({
  type: 'excalidrawlib',
  version: 2,
  libraryItems: [
    { id: 'kept-id', name: 'Slack', status: 'published', created: 17, elements: [{ id: 'a' }] },
    { id: 'empty', status: 'published', created: 18, elements: [] },
    { id: 'deleted-only', status: 'published', created: 19, elements: [{ id: 'x', isDeleted: true }] }
  ]
});
const v2Items = parseLibraryFile(v2, 'fixture');
assert(v2Items.length === 1, `v2: expected 1 usable item, got ${v2Items.length}`);
assert(v2Items[0].id === 'kept-id', 'v2: an item with its own id did not keep it');
assert(v2Items[0].name === 'Slack', 'v2: name lost');
assert(v2Items[0].created === 17, 'v2: created lost');

// --- the curated sets --------------------------------------------------------

const sets = curatedSets();
assert(sets.length === 7, `curated: expected 7 sets, got ${sets.length}`);
const curatedCount = sets.reduce((total, set) => total + set.items.length, 0);
assert(curatedCount === 111, `curated: expected 111 stencils, got ${curatedCount}`);
assert(
  sets.every(set => set.items.every(item => item.elements.length > 0)),
  'curated: a set contains an item with no elements'
);

// --- seeding happens once ----------------------------------------------------

const seeded = readLibrary();
assert(seeded.items.length === 111, `seed: expected 111 items, got ${seeded.items.length}`);
assert(seeded.seeded.length === 7, `seed: expected 7 sets recorded, got ${seeded.seeded.length}`);
assert(seeded.vaultBacked === true, 'seed: should be vault backed');
assert(fs.existsSync(libraryFilePath()), 'seed: nothing was written to the vault');
assert(
  Object.keys(seeded.origins).length === 111,
  'seed: attribution was not recorded for every seeded stencil'
);

resetLibraryCache();
const reread = readLibrary();
assert(reread.items.length === 111, `reseed: count changed to ${reread.items.length}`);
assert(
  reread.items.every((item, index) => item.id === seeded.items[index].id),
  'reseed: ids changed between reads'
);

// --- a deleted stencil stays deleted ----------------------------------------

const withoutFirst = reread.items.slice(1);
const removedId = reread.items[0].id;
writeLibrary(withoutFirst);
resetLibraryCache();
const afterDelete = readLibrary();
assert(
  afterDelete.items.length === 110,
  `delete: expected 110 items after a delete, got ${afterDelete.items.length}`
);
assert(
  !afterDelete.items.some(item => item.id === removedId),
  'delete: seeding put the deleted stencil back'
);
assert(
  afterDelete.origins[removedId] === undefined,
  'delete: attribution for a removed stencil was not pruned'
);
assert(
  Object.keys(afterDelete.origins).length === 110,
  'delete: attribution for the kept stencils was lost'
);

// --- an eighth set would still reach an existing vault -----------------------

const before = readLibrary();
before.seeded.splice(before.seeded.indexOf('cloud'), 1);
writeLibrary(before.items.filter(item => before.origins[item.id] !== 'cloud'));
resetLibraryCache();
const reseeded = readLibrary();
assert(
  reseeded.seeded.includes('cloud'),
  'new set: a set absent from `seeded` was not offered'
);
assert(
  Object.values(reseeded.origins).filter(set => set === 'cloud').length > 0,
  'new set: the newly seeded stencils carry no attribution'
);

fs.rmSync(vault, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} of ${checks} library checks failed`);
  process.exit(1);
}
console.log(`library: ${checks} checks passed`);
