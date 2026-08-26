// Which font files Excalidraw would use, read out of Excalidraw.
//
// Measuring text without a browser (measure-text.ts) needs three things, and
// every one of them is a fact about the version of `@excalidraw/excalidraw`
// installed rather than a fact about typography:
//
//   which families exist, and what number each answers to (`fontFamily: 5`)
//   which woff2 files each family is served from, and which characters each
//     file is declared to cover
//   each family's `lineHeight`, because Excalidraw's text height is
//     `fontSize * lineHeight * lineCount` and nothing else
//
// All three are read from the shipped bundle rather than copied into this
// file. The filenames carry content hashes, so a copy would go stale on the
// next upgrade and the failure would be a silently wrong width. Reading them
// means an upgrade that moves them either keeps working or fails loudly, and
// `scripts/check-text-metrics.mjs` is what makes it loud.
//
// Face selection follows the `@font-face` `unicode-range` descriptor, last
// declaration wins, which is what CSS says and what Blink does. Choosing by
// which file happens to carry the glyph instead put 63 ASCII pairs of Nunito
// on the wrong subset, whose kerning differs
// (docs/design/measuring-text-outside-a-browser.md).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kept } from "./hot.js";
import { parseFont, type ParsedFont } from "./font-file.js";
import { buildGpos, buildGsub, type Kerning, type Substitutions } from "./font-layout.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Where `@excalidraw/excalidraw` puts its production bundle and its fonts. */
export const EXCALIDRAW_DIST = path.join(
	moduleDir,
	"../../../node_modules/@excalidraw/excalidraw/dist/prod",
);

export interface FaceDescriptor {
	/** Absolute path to the woff2 file. */
	file: string;
	/** The `unicode-range` descriptor, parsed. `null` means the whole of unicode. */
	ranges: Array<[number, number]> | null;
}

export interface FamilyDescriptor {
	name: string;
	/** The `fontFamily` number, where the family has one. Fallbacks do not. */
	fontFamily?: number;
	lineHeight: number;
	faces: FaceDescriptor[];
}

// What a family falls through to for a character it does not carry.
//
// The bundle spells this as a switch — Excalifont falls back to Xiaolai and
// then Segoe UI Emoji, everything else straight to Segoe UI Emoji — and it is
// copied rather than parsed because it is two cases and an expression, not a
// table. Segoe UI Emoji ships no file and is resolved from the viewer's
// system, so it is not here: nothing on a server can measure it.
//
// Untested against Chrome. The stage 3 comparison covered only strings inside
// their family, so this is the shape of Excalidraw's own fallback applied to
// our own method, not a measured agreement. It is still much closer than the
// alternative, which is counting a character nobody can measure as zero wide.
const FALLBACKS: Record<string, string[]> = { Excalifont: ["Xiaolai"] };

// ── Reading the bundle ──────────────────────────────────────────────────────

/**
 * The chunk carrying the font registry.
 *
 * Named by content hash, so it is found by what it contains. Two markers,
 * because one of them alone matches often enough to be worth pairing.
 */
function registryChunk(): { file: string; source: string } {
	let entries: string[];
	try {
		entries = fs.readdirSync(EXCALIDRAW_DIST);
	} catch {
		throw new Error(`No Excalidraw bundle at ${EXCALIDRAW_DIST}. Run \`bun install\`.`);
	}
	for (const entry of entries) {
		if (!entry.endsWith(".js")) continue;
		const file = path.join(EXCALIDRAW_DIST, entry);
		const source = fs.readFileSync(file, "utf-8");
		if (source.includes("{uri:") && source.includes("lineHeight:")) return { file, source };
	}
	throw new Error(
		`No font registry in the Excalidraw bundle at ${EXCALIDRAW_DIST}. ` +
			"The package layout has changed; see src/core/fonts.ts.",
	);
}

/** `U+20-7e,U+a0` and friends, as ranges. */
function parseUnicodeRange(spec: string | undefined): Array<[number, number]> | null {
	if (!spec) return null;
	const ranges: Array<[number, number]> = [];
	for (const part of spec.split(/,\s*/)) {
		const body = part.trim().replace(/^U\+/i, "");
		if (body.includes("-")) {
			const [a, b] = body.split("-");
			ranges.push([parseInt(a as string, 16), parseInt(b as string, 16)]);
		} else if (body.includes("?")) {
			ranges.push([parseInt(body.replace(/\?/g, "0"), 16), parseInt(body.replace(/\?/g, "f"), 16)]);
		} else {
			const value = parseInt(body, 16);
			ranges.push([value, value]);
		}
	}
	return ranges;
}

/** Read a `{...}` object literal starting at `open`, balanced. */
function objectLiteralAt(source: string, open: number): string {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return source.slice(open, i + 1);
		}
	}
	throw new Error("unbalanced object literal in the Excalidraw bundle");
}

/**
 * Every family Excalidraw registers, with its files and its line height.
 *
 * Four things are pulled out of the minified bundle, in the order they depend
 * on each other:
 *
 *   `var x="./fonts/Family/File.woff2"`   the files, by minified variable name
 *   `{LATIN:"U+...",...}`                 the shared unicode-range constants
 *   `var y=[{uri:x,descriptors:{...}}]`   a family's face list
 *   `init(){...n("Excalifont",...y)...}`  which face list belongs to which name
 *
 * The last is what makes the directory name irrelevant: `Lilita` on disk is
 * the family `Lilita One`, and only the registration says so.
 */
function readRegistry(): Map<string, FamilyDescriptor> {
	const { source } = registryChunk();

	const files = new Map<string, string>();
	for (const m of source.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*"(\.\/fonts\/[^"]+)"/g)) {
		files.set(m[1] as string, m[2] as string);
	}

	const sharedRanges = new Map<string, string>();
	const rangesAt = source.indexOf('{LATIN:"');
	if (rangesAt !== -1) {
		for (const m of objectLiteralAt(source, rangesAt).matchAll(/([A-Z_]+):"([^"]+)"/g)) {
			sharedRanges.set(m[1] as string, m[2] as string);
		}
	}

	const faceLists = new Map<string, FaceDescriptor[]>();
	for (const m of source.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*(\[\{uri:[^;]*?\])\s*;/g)) {
		const faces: FaceDescriptor[] = [];
		const body = m[2] as string;
		const entry =
			/\{uri:([A-Za-z_$][\w$]*)(?:,descriptors:\{unicodeRange:(?:"([^"]*)"|(\w+)\.(\w+))(?:,\w+:"[^"]*")*\})?\}/g;
		for (const e of body.matchAll(entry)) {
			const uri = files.get(e[1] as string);
			if (!uri) continue;
			const spec = e[2] ?? (e[4] ? sharedRanges.get(e[4] as string) : undefined);
			faces.push({
				file: path.join(EXCALIDRAW_DIST, uri.replace(/^\.\//, "")),
				ranges: parseUnicodeRange(spec),
			});
		}
		if (faces.length > 0) faceLists.set(m[1] as string, faces);
	}

	// `Ie={Virgil:1,Helvetica:2,...}` — the `fontFamily` numbers.
	const numbers = new Map<string, number>();
	const enumAt = source.indexOf("{Virgil:");
	if (enumAt !== -1) {
		for (const m of objectLiteralAt(source, enumAt).matchAll(/(?:"([^"]+)"|(\w+)):(\d+)/g)) {
			numbers.set((m[1] ?? m[2]) as string, Number(m[3]));
		}
	}

	// `{[Ie.Excalifont]:{metrics:{...,lineHeight:1.25},...}}` — the metrics, by
	// family. Keyed through the same enum, so the names line up.
	const lineHeights = new Map<string, number>();
	const metrics = /\[\w+(?:\.(\w+)|\["([^"]+)"\])\]:\{metrics:\{[^}]*lineHeight:([\d.]+)\}/g;
	for (const m of source.matchAll(metrics)) {
		lineHeights.set((m[1] ?? m[2]) as string, Number(m[3]));
	}

	// `init(){...n("Excalifont",...sc)...}` — which face list each family gets.
	const registry = new Map<string, FamilyDescriptor>();
	for (const m of source.matchAll(/\bn\((?:"([^"]+)"|(\w+)),\.\.\.([A-Za-z_$][\w$]*)\)/g)) {
		let name = m[1];
		if (name === undefined) {
			// A family registered through a variable: `Mn="Xiaolai"`.
			const varName = m[2] as string;
			const literal = source.match(new RegExp(`\\b${varName}\\s*=\\s*"([^"]+)"`));
			if (!literal) continue;
			name = literal[1] as string;
		}
		const faces = faceLists.get(m[3] as string);
		if (!faces) continue;
		const existing = registry.get(name);
		if (existing && existing.faces.length >= faces.length) continue;
		const descriptor: FamilyDescriptor = {
			name,
			lineHeight: lineHeights.get(name) ?? 1.25,
			faces,
		};
		const number = numbers.get(name);
		if (number !== undefined) descriptor.fontFamily = number;
		registry.set(name, descriptor);
	}

	if (registry.size === 0) {
		throw new Error(
			`Read no font families out of the Excalidraw bundle at ${EXCALIDRAW_DIST}. ` +
				"The package layout has changed; see src/core/fonts.ts.",
		);
	}
	return registry;
}

/**
 * The registry, read once.
 *
 * In `kept()` because a reload rebuilds module scope, and because re-reading a
 * six-megabyte bundle on every save is a cost with nothing to show for it.
 */
export function fontRegistry(): Map<string, FamilyDescriptor> {
	return kept("fonts:registry", readRegistry);
}

/** The family a `fontFamily` number names, or undefined for a number nothing uses. */
export function familyOf(fontFamily: number): FamilyDescriptor | undefined {
	for (const family of fontRegistry().values()) {
		if (family.fontFamily === fontFamily) return family;
	}
	return undefined;
}

/**
 * The families a browser would try for this `fontFamily`, in CSS order: the
 * one named, then whatever it falls through to.
 *
 * A list of families rather than one flat list of faces, because the two
 * orders are opposite. Inside a family the *last* `@font-face` whose range
 * covers a character wins; across the stack the *first* family that has the
 * character wins. Flattening would put Xiaolai's 209 subsets in front of
 * Excalifont's Latin.
 */
export function faceStack(fontFamily: number): FaceDescriptor[][] {
	const family = familyOf(fontFamily);
	if (!family) return [];
	const registry = fontRegistry();
	const stack = [family.faces];
	for (const fallback of FALLBACKS[family.name] ?? []) {
		const next = registry.get(fallback);
		if (next) stack.push(next.faces);
	}
	return stack;
}

/**
 * Whether a server can compute a width for this family at all.
 *
 * `fontFamily` 2 is Helvetica, which Excalidraw marks `local` and ships no
 * file for: it resolves to whatever the viewer's system calls Helvetica, which
 * is not the same thing on two machines. A board carrying it has no honest
 * server-side width, so nothing here invents one.
 */
export function canMeasure(fontFamily: number): boolean {
	return faceStack(fontFamily).length > 0;
}

/**
 * Excalidraw's own `lineHeight` for a family — the whole of how it computes a
 * text element's height, along with the font size and the number of lines.
 *
 * The default is Excalifont's, which is what Excalidraw falls back to for a
 * family it does not recognise.
 */
export function lineHeightOf(fontFamily: number): number {
	return familyOf(fontFamily)?.lineHeight ?? 1.25;
}

// ── The parsed faces ────────────────────────────────────────────────────────

export interface LoadedFace {
	font: ParsedFont;
	gpos: Kerning | null;
	gsub: Substitutions | null;
}

/**
 * One woff2 file, parsed once per process.
 *
 * Lazy per file rather than per family, because a family's faces are chosen by
 * `unicode-range` and most strings touch one of them. It is what makes
 * Excalifont's CJK fallback affordable: Xiaolai ships 209 subsets, and a board
 * with no CJK on it parses none of them.
 */
export function loadFace(file: string): LoadedFace {
	const cache = kept("fonts:faces", () => new Map<string, LoadedFace>());
	const already = cache.get(file);
	if (already) return already;
	const font = parseFont(file);
	const face: LoadedFace = {
		font,
		gpos: font.gpos ? buildGpos(font.gpos) : null,
		gsub: font.gsub ? buildGsub(font.gsub) : null,
	};
	cache.set(file, face);
	return face;
}
