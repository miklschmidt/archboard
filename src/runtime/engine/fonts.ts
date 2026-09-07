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
// `src/runtime/engine/tests/text-metrics.test.ts` is what makes it loud.
//
// Face selection follows the `@font-face` `unicode-range` descriptor, last
// declaration wins, which is what CSS says and what Blink does. Choosing by
// which file happens to carry the glyph instead put 63 ASCII pairs of Nunito
// on the wrong subset, whose kerning differs
// (docs/design/measuring-text-outside-a-browser.md).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFont, type ParsedFont } from "@/runtime/engine/font-file";
import {
	buildGpos,
	buildGsub,
	type Kerning,
	type Substitutions,
} from "@/runtime/engine/font-layout";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Where `@excalidraw/excalidraw` puts its production bundle and its fonts. */
const EXCALIDRAW_DIST = path.join(
	moduleDir,
	"../../../node_modules/@excalidraw/excalidraw/dist/prod",
);

interface FaceDescriptor {
	/** Absolute path to the woff2 file. */
	file: string;
	/** The `unicode-range` descriptor, parsed. `null` means the whole of unicode. */
	ranges: Array<[number, number]> | null;
}

interface FamilyDescriptor {
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
 * A capture group of a match that the pattern always fills; "" where the
 * pattern did not.
 * @param match The match.
 * @param index The group number.
 * @returns The captured text.
 */
function group(match: RegExpMatchArray, index: number): string {
	return match[index] ?? "";
}

/**
 * The chunk carrying the font registry.
 *
 * Named by content hash, so it is found by what it contains. Two markers,
 * because one of them alone matches often enough to be worth pairing.
 * @returns The chunk's path and source.
 * @throws {Error} When the bundle or the registry chunk is missing.
 */
function registryChunk(): { file: string; source: string } {
	let entries: string[];
	try {
		entries = fs.readdirSync(EXCALIDRAW_DIST);
	} catch {
		throw new Error(`No Excalidraw bundle at ${EXCALIDRAW_DIST}. Run \`bun install\`.`);
	}
	for (const entry of entries) {
		if (!entry.endsWith(".js")) {
			continue;
		}
		const file = path.join(EXCALIDRAW_DIST, entry);
		const source = fs.readFileSync(file, "utf-8");
		if (source.includes("{uri:") && source.includes("lineHeight:")) {
			return { file, source };
		}
	}
	throw new Error(
		`No font registry in the Excalidraw bundle at ${EXCALIDRAW_DIST}. ` +
			"The package layout has changed; see src/runtime/engine/fonts.ts.",
	);
}

/**
 * One part of a `unicode-range` descriptor as a range: `U+20-7e`, `U+4??`
 * or a single code point.
 * @param part The part, without its `U+` prefix.
 * @returns The inclusive range.
 */
function parseRangePart(part: string): [number, number] {
	if (part.includes("-")) {
		const [a, b] = part.split("-");
		return [parseInt(a ?? "", 16), parseInt(b ?? "", 16)];
	}
	if (part.includes("?")) {
		return [parseInt(part.replace(/\?/g, "0"), 16), parseInt(part.replace(/\?/g, "f"), 16)];
	}
	const value = parseInt(part, 16);
	return [value, value];
}

/**
 * `U+20-7e,U+a0` and friends, as ranges.
 * @param spec The descriptor.
 * @returns The ranges, or null for no descriptor (the whole of unicode).
 */
function parseUnicodeRange(spec: string | undefined): Array<[number, number]> | null {
	if (!spec) {
		return null;
	}
	return spec.split(/,\s*/).map((part) => parseRangePart(part.trim().replace(/^U\+/i, "")));
}

/**
 * Read a `{...}` object literal starting at `open`, balanced.
 * @param source The bundle source.
 * @param open The offset of the opening brace.
 * @returns The literal's text.
 * @throws {Error} When the braces never balance.
 */
function objectLiteralAt(source: string, open: number): string {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return source.slice(open, i + 1);
			}
		}
	}
	throw new Error("unbalanced object literal in the Excalidraw bundle");
}

/**
 * `var x="./fonts/Family/File.woff2"`: the files, by minified variable name.
 * @param source The bundle source.
 * @returns File paths by variable.
 */
function readFiles(source: string): Map<string, string> {
	const files = new Map<string, string>();
	for (const m of source.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*"(\.\/fonts\/[^"]+)"/g)) {
		files.set(group(m, 1), group(m, 2));
	}
	return files;
}

/**
 * `{LATIN:"U+...",...}`: the shared unicode-range constants.
 * @param source The bundle source.
 * @returns Descriptors by constant name.
 */
function readSharedRanges(source: string): Map<string, string> {
	const sharedRanges = new Map<string, string>();
	const rangesAt = source.indexOf('{LATIN:"');
	if (rangesAt !== -1) {
		for (const m of objectLiteralAt(source, rangesAt).matchAll(/([A-Z_]+):"([^"]+)"/g)) {
			sharedRanges.set(group(m, 1), group(m, 2));
		}
	}
	return sharedRanges;
}

/**
 * The faces one `[{uri:x,descriptors:{...}}]` list declares.
 * @param body The list's source.
 * @param files File paths by variable.
 * @param sharedRanges Descriptors by constant name.
 * @returns The faces whose file is known.
 */
function readFaces(
	body: string,
	files: ReadonlyMap<string, string>,
	sharedRanges: ReadonlyMap<string, string>,
): FaceDescriptor[] {
	const faces: FaceDescriptor[] = [];
	const entry =
		/\{uri:([A-Za-z_$][\w$]*)(?:,descriptors:\{unicodeRange:(?:"([^"]*)"|(\w+)\.(\w+))(?:,\w+:"[^"]*")*\})?\}/g;
	for (const e of body.matchAll(entry)) {
		const uri = files.get(group(e, 1));
		if (!uri) {
			continue;
		}
		const spec = e[2] ?? (e[4] ? sharedRanges.get(e[4]) : undefined);
		faces.push({
			file: path.join(EXCALIDRAW_DIST, uri.replace(/^\.\//, "")),
			ranges: parseUnicodeRange(spec),
		});
	}
	return faces;
}

/**
 * `var y=[{uri:x,descriptors:{...}}]`: every family's face list, by variable.
 * @param source The bundle source.
 * @param files File paths by variable.
 * @param sharedRanges Descriptors by constant name.
 * @returns Face lists by variable, omitting empty ones.
 */
function readFaceLists(
	source: string,
	files: ReadonlyMap<string, string>,
	sharedRanges: ReadonlyMap<string, string>,
): Map<string, FaceDescriptor[]> {
	const faceLists = new Map<string, FaceDescriptor[]>();
	for (const m of source.matchAll(/var\s+([A-Za-z_$][\w$]*)\s*=\s*(\[\{uri:[^;]*?\])\s*;/g)) {
		const faces = readFaces(group(m, 2), files, sharedRanges);
		if (faces.length > 0) {
			faceLists.set(group(m, 1), faces);
		}
	}
	return faceLists;
}

/**
 * `Ie={Virgil:1,Helvetica:2,...}`: the `fontFamily` numbers.
 * @param source The bundle source.
 * @returns Numbers by family name.
 */
function readNumbers(source: string): Map<string, number> {
	const numbers = new Map<string, number>();
	const enumAt = source.indexOf("{Virgil:");
	if (enumAt !== -1) {
		for (const m of objectLiteralAt(source, enumAt).matchAll(/(?:"([^"]+)"|(\w+)):(\d+)/g)) {
			numbers.set(m[1] ?? group(m, 2), Number(m[3]));
		}
	}
	return numbers;
}

/**
 * `{[Ie.Excalifont]:{metrics:{...,lineHeight:1.25},...}}`: the metrics, by
 * family. Keyed through the same enum, so the names line up.
 * @param source The bundle source.
 * @returns Line heights by family name.
 */
function readLineHeights(source: string): Map<string, number> {
	const lineHeights = new Map<string, number>();
	const metrics = /\[\w+(?:\.(\w+)|\["([^"]+)"\])\]:\{metrics:\{[^}]*lineHeight:([\d.]+)\}/g;
	for (const m of source.matchAll(metrics)) {
		lineHeights.set(m[1] ?? group(m, 2), Number(m[3]));
	}
	return lineHeights;
}

/**
 * The family name one registration call gives: a string literal, or a
 * variable such as `Mn="Xiaolai"` resolved against the source.
 * @param source The bundle source.
 * @param m The registration match.
 * @returns The name, or undefined when the variable has no literal.
 */
function registeredName(source: string, m: RegExpMatchArray): string | undefined {
	if (m[1] !== undefined) {
		return m[1];
	}
	const literal = source.match(new RegExp(`\\b${group(m, 2)}\\s*=\\s*"([^"]+)"`));
	return literal?.[1];
}

/** What one registration call in the bundle's `init()` says. */
interface Registration {
	name: string;
	faces: FaceDescriptor[];
}

/**
 * `init(){...n("Excalifont",...sc)...}`: which face list each family gets.
 * @param source The bundle source.
 * @param faceLists Face lists by variable.
 * @returns Every registration whose name and faces resolve, in source order.
 */
function readRegistrations(
	source: string,
	faceLists: ReadonlyMap<string, FaceDescriptor[]>,
): Registration[] {
	const out: Registration[] = [];
	for (const m of source.matchAll(/\bn\((?:"([^"]+)"|(\w+)),\.\.\.([A-Za-z_$][\w$]*)\)/g)) {
		const name = registeredName(source, m);
		const faces = faceLists.get(group(m, 3));
		if (name !== undefined && faces) {
			out.push({ name, faces });
		}
	}
	return out;
}

/**
 * One family's descriptor, with the number and line height the bundle gives
 * it when it gives them.
 * @param name The family name.
 * @param faces The family's faces.
 * @param numbers Numbers by family name.
 * @param lineHeights Line heights by family name.
 * @returns The descriptor.
 */
function describeFamily(
	name: string,
	faces: FaceDescriptor[],
	numbers: ReadonlyMap<string, number>,
	lineHeights: ReadonlyMap<string, number>,
): FamilyDescriptor {
	const descriptor: FamilyDescriptor = { name, lineHeight: lineHeights.get(name) ?? 1.25, faces };
	const number = numbers.get(name);
	if (number !== undefined) {
		descriptor.fontFamily = number;
	}
	return descriptor;
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
 * the family `Lilita One`, and only the registration says so. A family
 * registered twice keeps the registration with more faces.
 * @returns Families by name.
 * @throws {Error} When the bundle yields no families.
 */
function readRegistry(): Map<string, FamilyDescriptor> {
	const { source } = registryChunk();
	const faceLists = readFaceLists(source, readFiles(source), readSharedRanges(source));
	const numbers = readNumbers(source);
	const lineHeights = readLineHeights(source);
	const registry = new Map<string, FamilyDescriptor>();
	for (const { name, faces } of readRegistrations(source, faceLists)) {
		const existing = registry.get(name);
		if (existing && existing.faces.length >= faces.length) {
			continue;
		}
		registry.set(name, describeFamily(name, faces, numbers, lineHeights));
	}
	if (registry.size === 0) {
		throw new Error(
			`Read no font families out of the Excalidraw bundle at ${EXCALIDRAW_DIST}. ` +
				"The package layout has changed; see src/runtime/engine/fonts.ts.",
		);
	}
	return registry;
}

/** The registry, read once per process. */
const registry = readRegistry();

/**
 * Every family Excalidraw ships, by name.
 * @returns The registry.
 */
function fontRegistry(): Map<string, FamilyDescriptor> {
	return registry;
}

/**
 * The family a `fontFamily` number names.
 * @param fontFamily The number.
 * @returns The family, or undefined for a number nothing uses.
 */
function familyOf(fontFamily: number): FamilyDescriptor | undefined {
	for (const family of fontRegistry().values()) {
		if (family.fontFamily === fontFamily) {
			return family;
		}
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
 * @param fontFamily The number.
 * @returns Each family's faces, first family first; empty for an unknown number.
 */
function faceStack(fontFamily: number): FaceDescriptor[][] {
	const family = familyOf(fontFamily);
	if (!family) {
		return [];
	}
	const availableFamilies = fontRegistry();
	const stack = [family.faces];
	for (const fallback of FALLBACKS[family.name] ?? []) {
		const next = availableFamilies.get(fallback);
		if (next) {
			stack.push(next.faces);
		}
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
 * @param fontFamily The number.
 * @returns True when a file-backed face exists.
 */
function canMeasure(fontFamily: number): boolean {
	return faceStack(fontFamily).length > 0;
}

/**
 * Excalidraw's own `lineHeight` for a family — the whole of how it computes a
 * text element's height, along with the font size and the number of lines.
 * The default is Excalifont's, which is what Excalidraw falls back to for a
 * family it does not recognise.
 * @param fontFamily The number.
 * @returns The line height multiplier.
 */
function lineHeightOf(fontFamily: number): number {
	return familyOf(fontFamily)?.lineHeight ?? 1.25;
}

// ── The parsed faces ────────────────────────────────────────────────────────

interface LoadedFace {
	font: ParsedFont;
	gpos: Kerning | null;
	gsub: Substitutions | null;
}

const faceCache = new Map<string, LoadedFace>();

/**
 * One woff2 file, parsed once per process.
 *
 * Lazy per file rather than per family, because a family's faces are chosen by
 * `unicode-range` and most strings touch one of them. It is what makes
 * Excalifont's CJK fallback affordable: Xiaolai ships 209 subsets, and a board
 * with no CJK on it parses none of them.
 * @param file The woff2 path.
 * @returns The parsed face with its layout tables.
 */
function loadFace(file: string): LoadedFace {
	const already = faceCache.get(file);
	if (already) {
		return already;
	}
	const font = parseFont(file);
	const face: LoadedFace = {
		font,
		gpos: font.gpos ? buildGpos(font.gpos) : null,
		gsub: font.gsub ? buildGsub(font.gsub) : null,
	};
	faceCache.set(file, face);
	return face;
}

export {
	EXCALIDRAW_DIST,
	type FaceDescriptor,
	type FamilyDescriptor,
	fontRegistry,
	familyOf,
	faceStack,
	canMeasure,
	lineHeightOf,
	type LoadedFace,
	loadFace,
};
