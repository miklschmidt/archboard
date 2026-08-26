#!/usr/bin/env bun

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

import fs from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const vault = fs.mkdtempSync(join(os.tmpdir(), "archboard-library-"));
process.env.ARCHBOARD_VAULT = vault;

const {
	parseLibraryFile,
	curatedSets,
	readLibrary,
	writeLibrary,
	resetLibraryCache,
	libraryFilePath,
} = await import(join(__dirname, "..", "src", "runtime", "engine", "library.ts"));

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
	type: "excalidrawlib",
	version: 1,
	library: [
		[
			{ id: "a", type: "rectangle" },
			{ id: "b", type: "text" },
		],
		[{ id: "c", type: "ellipse" }],
	],
});
const v1Items = parseLibraryFile(v1, "fixture");
assert(v1Items.length === 2, `v1: expected 2 items, got ${v1Items.length}`);
assert(v1Items[0].elements.length === 2, "v1: elements not carried");
assert(v1Items[0].status === "published", "v1: default status is not published");
assert(v1Items[0].id !== v1Items[1].id, "v1: two items share an id");
assert(
	parseLibraryFile(v1, "fixture")[0].id === v1Items[0].id,
	"v1: ids are not deterministic — the same file would seed twice",
);
assert(
	parseLibraryFile(v1, "other")[0].id !== v1Items[0].id,
	"v1: two different sets derive the same id",
);

const v2 = JSON.stringify({
	type: "excalidrawlib",
	version: 2,
	libraryItems: [
		{ id: "kept-id", name: "Slack", status: "published", created: 17, elements: [{ id: "a" }] },
		{ id: "empty", status: "published", created: 18, elements: [] },
		{
			id: "deleted-only",
			status: "published",
			created: 19,
			elements: [{ id: "x", isDeleted: true }],
		},
	],
});
const v2Items = parseLibraryFile(v2, "fixture");
assert(v2Items.length === 1, `v2: expected 1 usable item, got ${v2Items.length}`);
assert(v2Items[0].id === "kept-id", "v2: an item with its own id did not keep it");
assert(v2Items[0].name === "Slack", "v2: name lost");
assert(v2Items[0].created === 17, "v2: created lost");

// --- the curated sets --------------------------------------------------------

const sets = curatedSets();
assert(sets.length === 7, `curated: expected 7 sets, got ${sets.length}`);
const curatedCount = sets.reduce((total, set) => total + set.items.length, 0);
assert(curatedCount === 111, `curated: expected 111 stencils, got ${curatedCount}`);
assert(
	sets.every((set) => set.items.every((item) => item.elements.length > 0)),
	"curated: a set contains an item with no elements",
);

// --- seeding happens once ----------------------------------------------------

const seeded = readLibrary();
assert(seeded.items.length === 111, `seed: expected 111 items, got ${seeded.items.length}`);
assert(seeded.seeded.length === 7, `seed: expected 7 sets recorded, got ${seeded.seeded.length}`);
assert(seeded.vaultBacked === true, "seed: should be vault backed");
assert(fs.existsSync(libraryFilePath()), "seed: nothing was written to the vault");
assert(
	Object.keys(seeded.origins).length === 111,
	"seed: attribution was not recorded for every seeded stencil",
);

resetLibraryCache();
const reread = readLibrary();
assert(reread.items.length === 111, `reseed: count changed to ${reread.items.length}`);
assert(
	reread.items.every((item, index) => item.id === seeded.items[index].id),
	"reseed: ids changed between reads",
);

// --- a deleted stencil stays deleted ----------------------------------------

const withoutFirst = reread.items.slice(1);
const removedId = reread.items[0].id;
writeLibrary(withoutFirst);
resetLibraryCache();
const afterDelete = readLibrary();
assert(
	afterDelete.items.length === 110,
	`delete: expected 110 items after a delete, got ${afterDelete.items.length}`,
);
assert(
	!afterDelete.items.some((item) => item.id === removedId),
	"delete: seeding put the deleted stencil back",
);
assert(
	afterDelete.origins[removedId] === undefined,
	"delete: attribution for a removed stencil was not pruned",
);
assert(
	Object.keys(afterDelete.origins).length === 110,
	"delete: attribution for the kept stencils was lost",
);

// --- an eighth set would still reach an existing vault -----------------------

const before = readLibrary();
before.seeded.splice(before.seeded.indexOf("cloud"), 1);
writeLibrary(before.items.filter((item) => before.origins[item.id] !== "cloud"));
resetLibraryCache();
const reseeded = readLibrary();
assert(reseeded.seeded.includes("cloud"), "new set: a set absent from `seeded` was not offered");
assert(
	Object.values(reseeded.origins).filter((set) => set === "cloud").length > 0,
	"new set: the newly seeded stencils carry no attribution",
);

// --- choosing and placing a stencil ------------------------------------------
//
// The catalogue is what `library list` and `library insert` are made of, so the
// two decisions it makes for them are pinned here: which stencil a name means,
// and what a placed copy is. Both are pure — no canvas server involved.

const { chooseStencil, remapElements, AmbiguousStencilError, UnknownStencilError } = await import(
	join(__dirname, "..", "src", "runtime", "engine", "library-catalogue.ts")
);

const entries = [
	{ id: "one", name: "Database", source: "cloud", elements: 6, width: 66, height: 101, text: null },
	{
		id: "two",
		name: "Database",
		source: "drwnio",
		elements: 4,
		width: 199,
		height: 253,
		text: null,
	},
	{
		id: "three",
		name: "Server rack",
		source: "cloud",
		elements: 104,
		width: 224,
		height: 287,
		text: null,
	},
];

function refusal(query) {
	try {
		chooseStencil(entries, query);
		return null;
	} catch (error) {
		return error;
	}
}

assert(
	chooseStencil(entries, { name: "server rack" }).id === "three",
	"choose: a name is not matched case-insensitively",
);
assert(
	chooseStencil(entries, { name: "Database", source: "drwnio" }).id === "two",
	"choose: source does not settle a shared name",
);
assert(chooseStencil(entries, { itemId: "one" }).id === "one", "choose: an id does not select");

const ambiguous = refusal({ name: "Database" });
assert(
	ambiguous instanceof AmbiguousStencilError,
	"choose: a name two libraries use was resolved instead of refused",
);
assert(ambiguous?.candidates.length === 2, "choose: the refusal does not carry both candidates");
assert(
	ambiguous?.message.includes("cloud") && ambiguous?.message.includes("drwnio"),
	"choose: the refusal does not name the sources, so the caller cannot answer it",
);
assert(
	refusal({ name: "Nothing" }) instanceof UnknownStencilError,
	"choose: an unknown name did not refuse",
);
assert(
	refusal({ itemId: "nope" }) instanceof UnknownStencilError,
	"choose: an unknown id did not refuse",
);
assert(
	refusal({ name: "Database", source: "system-design" }) instanceof UnknownStencilError,
	"choose: a source nothing matches did not refuse",
);

// Placing a copy: fresh ids everywhere, every internal reference following
// them, and the whole thing translated so its top-left lands where asked.
const stencil = [
	{ id: "a", type: "rectangle", x: 500, y: 400, width: 100, height: 50, groupIds: ["g"] },
	{
		id: "b",
		type: "draw",
		x: 520,
		y: 460,
		width: 10,
		height: 10,
		groupIds: ["g"],
		startBinding: { elementId: "a", focus: 0 },
		endBinding: { elementId: "a", focus: 1 },
	},
	{ id: "c", type: "text", x: 505, y: 405, width: 40, height: 20, containerId: "a", groupIds: [] },
];
const placed = remapElements(stencil, 0, 0, { library: { item: "Fixture" } });

assert(
	placed.every((el) => !["a", "b", "c"].includes(el.id)),
	"insert: element ids were reused, so a second insert would collide",
);
assert(new Set(placed.map((el) => el.id)).size === 3, "insert: two placed elements share an id");
assert(
	placed[0].x === 0 && placed[0].y === 0,
	"insert: the top-left corner did not land where asked",
);
assert(
	placed[1].x === 20 && placed[1].y === 60,
	"insert: the stencil was distorted rather than translated",
);
assert(placed[1].type === "arrow", 'insert: the v1 "draw" type was not translated to "arrow"');
assert(
	placed[1].startBinding.elementId === placed[0].id,
	"insert: an arrow binding still points at the original id",
);
assert(
	placed[1].endBinding.elementId === placed[0].id,
	"insert: the far end of a stencil arrow still points at the original id",
);
assert(
	placed[1].endBinding.focus === 1,
	"insert: the stencil's own focus was replaced by a centred one",
);
assert(
	placed[1].start === undefined && placed[1].end === undefined,
	"insert: a stencil arrow was given `start`/`end` refs, which are input only and would be routed centre to centre",
);
assert(
	placed[2].containerId === placed[0].id,
	"insert: a bound label still points at the original container",
);
assert(
	placed[0].groupIds[0] === placed[1].groupIds[0],
	"insert: grouped elements were split into different groups",
);
assert(
	placed[0].groupIds[0] !== "g",
	"insert: the group id was reused, so two inserts would be one group",
);
assert(
	placed[0].customData.library.item === "Fixture",
	"insert: the placed copy does not record where it came from",
);
assert(
	stencil[0].x === 500 && stencil[0].id === "a",
	"insert: the library item itself was mutated",
);

fs.rmSync(vault, { recursive: true, force: true });

if (failures > 0) {
	console.error(`\n${failures} of ${checks} library checks failed`);
	process.exit(1);
}
console.log(`library: ${checks} checks passed`);
