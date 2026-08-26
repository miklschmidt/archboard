#!/usr/bin/env bun

// The width of a piece of text, computed without a browser, is the width a
// browser would have computed.
//
// ADR 0015 converts the agent-friendly shape once, on write, and a label
// becomes a text element with a width. Excalidraw's width for one is exactly
// what the browser's `measureText` returns — no estimate and no correction
// anywhere in that path — so the server has to arrive at the same number or
// the note is wrong and the first render rewrites it.
//
// The numbers below are Chrome's, taken in headless Chrome 150 on 2026-08-20
// and written up in docs/design/measuring-text-outside-a-browser.md. They are
// pinned here rather than re-derived, because the whole point is that this
// code agrees with something it cannot ask.
//
// WHY NOT JUST THE BROWSER CHECK. scripts/check-fixed-point.mjs renders a
// board in a real browser and is the acceptance test for the converter, which
// makes it the better check and the slower one: it needs a browser on PATH and
// it exits 2 without one. This needs nothing, runs in a second, and fails on
// the arithmetic rather than on the render, so a broken kern table is named
// here instead of showing up as "four text elements came back different".
//
// FIVE THINGS SIT ON TOP OF SUMMING ADVANCE WIDTHS, and each has a check of
// its own below, because each was found by a disagreement with Chrome and each
// would go back to being a silent few pixels if it were dropped:
// kerning, ligatures reached through a chained context, no shaping across a
// space, face selection by unicode-range, and zero-width ignorables.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const src = (p) => join(moduleDir, "..", "src", p);

const { measureText, measureLineWidth, canMeasure, faceFileFor } = await import(
	src("runtime/engine/measure-text.ts")
);
const { fontRegistry, familyOf, faceStack, lineHeightOf, loadFace } = await import(
	src("runtime/engine/fonts.ts")
);

let failures = 0;
let checks = 0;
const assert = (condition, message) => {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`FAIL - ${message}`);
};

// Chrome reports to about four decimals and the residual here is floating
// point, growing with size and string length and vanishing at 12 px. A
// thousandth of a pixel is the tolerance the finding measured; a model
// difference is never this small.
const TOLERANCE = 0.002;
const close = (got, want) => Math.abs(got - want) <= TOLERANCE;
const near = (got, want, what) =>
	assert(close(got, want), `${what}: ${got.toFixed(4)}, Chrome says ${want}`);

const EXCALIFONT = 5;
const VIRGIL = 1;
const HELVETICA = 2;
const LIBERATION = 9;
const NUNITO = 6;

// What the sum of advance widths alone would give: measured character by
// character, since a single character has nothing to kern against and nothing
// to form a ligature with.
const advanceSum = (text, fontSize, fontFamily) =>
	[...text].reduce((total, ch) => total + measureLineWidth(ch, fontSize, fontFamily), 0);

// ── The reference strings ───────────────────────────────────────────────────
//
// Measured in Chrome at fontSize 20 with Excalifont's seven FontFaces added
// and `document.fonts.ready` awaited. The left column of the same table in the
// finding — 163.2715 and the rest — is the last-resort font, and is what
// server-is-the-truth.md §3 mistook for Excalifont.

console.log("# the five reference strings, in Excalifont at 20 px");
const REFERENCE = [
	["a standalone caption", 203.6598],
	["AuthService", 114.4999],
	["Queue", 58.7599],
	["Gate", 48.92],
	["gRPC", 52.36],
];
for (const [text, chrome] of REFERENCE) {
	near(measureLineWidth(text, 20, EXCALIFONT), chrome, `"${text}"`);
}

// The one number from outside that experiment. server-is-the-truth.md §1C
// records the true width of an `AuthService` label on a real board as 90.54 px,
// read out of a browser; that board's text is fontFamily 1 at fontSize 16.
console.log("# and the independent one, from a real board rather than a probe");
const virgil = measureLineWidth("AuthService", 16, VIRGIL);
near(virgil, 90.544, 'Virgil "AuthService" at 16 px');
assert(
	Math.abs(virgil - 90.54) < 0.01,
	`Virgil "AuthService" at 16 px is ${virgil.toFixed(3)}, and a real board recorded 90.54`,
);

// Width is linear in font size, which is why one em measurement serves every
// size. Chrome agreed at 12, 14, 16, 20, 28 and 36 to within 0.0012 px.
console.log("# and at every size, because width is linear in it");
for (const size of [12, 14, 16, 20, 28, 36]) {
	const scaled = measureLineWidth("AuthService", size, EXCALIFONT);
	near(scaled, (114.4999 * size) / 20, `"AuthService" at ${size} px`);
}

// ── Kerning ─────────────────────────────────────────────────────────────────
//
// Excalifont's GPOS carries a `kern` feature: two lookups, seven explicit
// pairs and two class matrices. The deltas are the ones the finding measured
// against Chrome, so a lookup that stopped being reached shows up as the
// string going back to its advance-width sum.

console.log("# kerning, by how much narrower than the advance sum each string is");
const KERNED = [
	["To", 1.8],
	["P.", 2.0],
	["LT", 1.4],
	["postgres://primary", 4.0],
	["Kafka topic: orders.v2", 1.0],
];
for (const [text, saving] of KERNED) {
	const measured = measureLineWidth(text, 20, EXCALIFONT);
	near(advanceSum(text, 20, EXCALIFONT) - measured, saving, `"${text}" kerns by`);
}

// ── Ligatures, through a chained context ────────────────────────────────────
//
// Excalifont's `liga` is a GSUB type 6 chained contextual lookup that fires a
// nested type 4 ligature lookup. A reader handling only type 4 finds no
// ligatures at all, and `office` comes out 1.82 px too wide — which is exactly
// what this measures, so the check fails on the cause rather than the symptom.

console.log("# ligatures, which are only reachable through the chained lookup");
for (const text of ["office", "ffi", "ffl"]) {
	const measured = measureLineWidth(text, 20, EXCALIFONT);
	near(advanceSum(text, 20, EXCALIFONT) - measured, 1.82, `"${text}" ligates by`);
}
assert(
	measureLineWidth("ffi", 20, EXCALIFONT) < measureLineWidth("fif", 20, EXCALIFONT),
	"ffi is not narrower than the same three glyphs in an order that cannot ligate",
);

// ── No shaping crosses a space ──────────────────────────────────────────────
//
// Blink shapes word by word. Liberation Sans kerns a space against A, L, T, Y
// and P, and Chrome does not apply those: ` A` measured 94.482 px at fontSize
// 100 where the font's own kern table says 88.965. Eight pairs, all involving
// a space, and all eight agree once the string is split at spaces first.

console.log("# and no shaping crosses a space, because Blink shapes word by word");
near(measureLineWidth(" A", 100, LIBERATION), 94.4824, '" A" in Liberation Sans at 100 px');
assert(
	close(measureLineWidth(" A", 100, LIBERATION), advanceSum(" A", 100, LIBERATION)),
	"a space kerned against the letter after it, which Chrome does not do",
);

// ── Ignorables ──────────────────────────────────────────────────────────────

console.log("# and a soft hyphen is laid out as nothing");
assert(
	close(measureLineWidth("a­b", 20, EXCALIFONT), measureLineWidth("ab", 20, EXCALIFONT)),
	"a soft hyphen took up space",
);
assert(
	close(measureLineWidth("a​b", 20, EXCALIFONT), measureLineWidth("ab", 20, EXCALIFONT)),
	"a zero-width space took up space",
);

// ── Height is arithmetic, not measurement ───────────────────────────────────
//
// Excalidraw's getTextHeight is fontSize * lineHeight * lineCount, with
// lineHeight a per-family constant from its own registry. The plan called
// width and height "the two measured fields"; only one of them is.

console.log("# height is fontSize x lineHeight x lineCount, and nothing else");
assert(
	measureText("one line", 20, EXCALIFONT).height === 20 * 1.25 * 1,
	"a one-line Excalifont text at 20 px is not 25 tall",
);
assert(
	measureText("two\nlines", 20, EXCALIFONT).height === 20 * 1.25 * 2,
	"a two-line Excalifont text at 20 px is not 50 tall",
);
assert(
	measureText("two\nlines", 20, NUNITO).height === 20 * 1.35 * 2,
	"Nunito does not use its own line height",
);
assert(
	measureText("a\nbb\nc", 20, EXCALIFONT).width === measureLineWidth("bb", 20, EXCALIFONT),
	"a multi-line text is not as wide as its widest line",
);

const LINE_HEIGHTS = {
	Excalifont: 1.25,
	Virgil: 1.25,
	"Comic Shanns": 1.25,
	Nunito: 1.35,
	Cascadia: 1.2,
	"Lilita One": 1.15,
	"Liberation Sans": 1.15,
};
for (const [name, lineHeight] of Object.entries(LINE_HEIGHTS)) {
	const family = fontRegistry().get(name);
	assert(
		family?.lineHeight === lineHeight,
		`${name}'s line height reads as ${family?.lineHeight}, and Excalidraw's registry says ${lineHeight}`,
	);
	if (family?.fontFamily !== undefined) {
		assert(
			lineHeightOf(family.fontFamily) === lineHeight,
			`lineHeightOf(${family.fontFamily}) is not ${lineHeight}`,
		);
	}
}

// ── The registry is read out of the bundle, not copied ──────────────────────
//
// Every filename below carries a content hash, so a copy would go stale on the
// next upgrade and the failure would be a silently wrong width. These
// assertions are what makes an upgrade that moves them loud.

console.log("# the registry is read out of the shipped bundle");
const registry = fontRegistry();
for (const [name, count] of Object.entries({
	Excalifont: 7,
	Nunito: 5,
	"Comic Shanns": 4,
	"Lilita One": 2,
	Cascadia: 1,
	Virgil: 1,
	"Liberation Sans": 1,
	Xiaolai: 209,
})) {
	assert(
		registry.get(name)?.faces.length === count,
		`${name} reads as ${registry.get(name)?.faces.length ?? "absent"} faces, and Excalidraw ships ${count}`,
	);
}
for (const [number, name] of Object.entries({
	1: "Virgil",
	3: "Cascadia",
	5: "Excalifont",
	6: "Nunito",
	7: "Lilita One",
	8: "Comic Shanns",
	9: "Liberation Sans",
})) {
	assert(
		familyOf(Number(number))?.name === name,
		`fontFamily ${number} reads as ${familyOf(Number(number))?.name ?? "nothing"}, not ${name}`,
	);
}

// Helvetica is `local` in Excalidraw's registry and ships no file: it resolves
// to whatever the viewer's system calls Helvetica, which is not the same thing
// on two machines. No server can measure it, and saying so is better than
// returning a number.
assert(
	!canMeasure(HELVETICA),
	"Helvetica reports as measurable, and it ships no file for anyone to measure",
);
assert(
	canMeasure(EXCALIFONT) && canMeasure(VIRGIL),
	"a family that ships files reports as unmeasurable",
);
assert(
	measureText("anything", 20, HELVETICA).missing.length === 8,
	"an unmeasurable family did not report its characters as unmeasured",
);

// ── Face selection follows the unicode-range ────────────────────────────────
//
// Google's Nunito subsets overlap: several carry ASCII glyphs, and the browser
// still picks by the declared unicode-range with the last declaration winning,
// as CSS says. Choosing by cmap coverage instead put 63 ASCII pairs on the
// wrong subset, whose kerning differs — same glyph, same advance, different
// kern table, which is why single characters could not detect it and pairs
// could.

console.log("# and a face is chosen by its declared range, not by what it happens to carry");
const nunito = registry.get("Nunito");
const carriesA = nunito.faces.filter((face) => loadFace(face.file).font.cmap.has(0x41));
const declaresA = nunito.faces.filter(
	(face) => face.ranges === null || face.ranges.some(([a, b]) => 0x41 >= a && 0x41 <= b),
);
assert(
	carriesA.length > 1 && declaresA.length >= 1 && carriesA[0] !== declaresA[declaresA.length - 1],
	`${carriesA.length} Nunito subsets carry "A" and ${declaresA.length} declares it; ` +
		"the two rules pick the same file here, so this check proves nothing",
);
assert(
	faceFileFor(0x41, NUNITO) === declaresA[declaresA.length - 1].file,
	`"A" in Nunito is measured from ${(faceFileFor(0x41, NUNITO) ?? "nothing").split("/").pop()}, ` +
		`and its unicode-range says ${declaresA[declaresA.length - 1].file.split("/").pop()}`,
);
// Not a width check, deliberately. The five subsets agree on `A`'s advance in
// the version shipped today, so no measurement can tell the rules apart — but
// they carry different kern tables, which is what made 63 ASCII pairs of the
// coverage rule disagree with Chrome when the finding measured it.
assert(
	faceFileFor(0x41, EXCALIFONT) === registry.get("Excalifont").faces[0].file,
	"Latin in Excalifont does not come from the subset that declares Latin",
);

// The fallback stack is a list of families rather than one flat list of faces,
// because the two orders are opposite: last-declared wins inside a family,
// first family wins across the stack. Flattened, Xiaolai's 209 subsets would
// sit in front of Excalifont's Latin.
const stack = faceStack(EXCALIFONT);
assert(
	stack.length === 2 && stack[0].length === 7 && stack[1].length === 209,
	`Excalifont's stack reads as ${stack.map((faces) => faces.length).join(" then ")}, not 7 then 209`,
);
assert(
	close(measureLineWidth("A", 20, EXCALIFONT), measureLineWidth("A", 20, EXCALIFONT)),
	"a repeat measurement disagreed with itself",
);
assert(
	measureText("A", 20, EXCALIFONT).missing.length === 0,
	"a Latin capital fell through Excalifont to the fallback",
);

// ── The parse is cached, once per process ───────────────────────────────────
//
// 4.4 ms on node and 15.9 ms on bun to parse Excalifont's seven subsets, and a
// few microseconds per string after that. The cache lives in kept() rather
// than module scope, or a hot reload would rebuild it under a running canvas;
// `bun run test:module-scope` is what enforces that, and this is what proves
// the cache exists at all.

console.log("# the parse is cached, so it costs once per process");
const first = loadFace(registry.get("Excalifont").faces[0].file);
const second = loadFace(registry.get("Excalifont").faces[0].file);
assert(first === second, "a face was parsed twice, so nothing is cached");

const warm = Date.now();
for (let i = 0; i < 2000; i++) measureLineWidth("AuthService", 20, EXCALIFONT);
const elapsed = Date.now() - warm;
assert(elapsed < 500, `2000 warm measurements took ${elapsed} ms, which is not a warm cache`);

if (failures > 0) {
	console.error(`\n${failures} of ${checks} text-metrics checks failed`);
	process.exit(1);
}
console.log(`text metrics: ${checks} checks passed`);
