// Enough OpenType layout to reproduce what a browser's shaper does to a run
// of text in one font: the substitutions that are on by default, and pair
// kerning.
//
// Summing advance widths gets most of the way and is not the answer. Measured
// against Chrome (docs/design/measuring-text-outside-a-browser.md), two things
// sit on top and both are cheap:
//
//   kerning     Excalifont's GPOS carries a `kern` feature — two lookups, seven
//               explicit pairs and two class matrices. Without it `To` is
//               1.80 px too wide at fontSize 20 and `postgres://primary` 4.00.
//   ligatures   `office`, `waffle`, `ffi` and `ffl` came out 1.82 px too wide.
//               Excalifont reaches its ligatures through a chained contextual
//               lookup (GSUB type 6) that fires a nested ligature lookup (type
//               4), so a reader handling only type 4 finds none of them
//               (lib/font-layout-gsub.ts).
//
// What deliberately is not here: `calt`, `clig` and `rclt`. HarfBuzz has them
// on by default and Excalifont's GSUB declares none of them, so implementing
// them would be guessing at behaviour nothing on disk exercises. A family that
// used one would measure slightly wide, which is the failure to prefer over a
// wrong contextual rule applied everywhere.

import { Reader } from "@/runtime/engine/font-file";
import { type Substitutions, buildGsub } from "@/runtime/engine/lib/font-layout-gsub";
import {
	SCRIPTS,
	classDef,
	coverage,
	deExtend,
	glyphsByCoverageIndex,
	header,
	lookupOffsetAt,
	lookupsForFeatures,
	readLookup,
	readOffsets,
	valueRecordSize,
	xAdvance,
} from "@/runtime/engine/lib/font-layout-tables";

// ── GPOS: pair kerning ──────────────────────────────────────────────────────

interface PairSubtable {
	lookup(first: number, second: number): number | undefined;
}

/**
 * Pair adjustment, format 1: explicit pairs, listed per first glyph.
 * @param buf The GPOS table.
 * @param off The subtable's offset.
 * @param r The reader, positioned after the format field.
 * @returns The subtable.
 */
function pairFormat1(buf: Buffer, off: number, r: Reader): PairSubtable {
	const cov = coverage(buf, off + r.u16());
	const vf1 = r.u16();
	const vf2 = r.u16();
	const offsets = readOffsets(r, r.u16(), off);
	const byIndex = glyphsByCoverageIndex(cov);
	const pairs = new Map<string, number>();
	for (const [i, setOff] of offsets.entries()) {
		const first = byIndex.get(i);
		if (first === undefined) {
			continue;
		}
		const pr = new Reader(buf, setOff);
		const n = pr.u16();
		for (let j = 0; j < n; j++) {
			const second = pr.u16();
			const value = xAdvance(pr, vf1);
			xAdvance(pr, vf2);
			pairs.set(`${first},${second}`, value);
		}
	}
	return {
		/**
		 * The explicit adjustment for a pair.
		 * @param a The first glyph.
		 * @param b The second glyph.
		 * @returns The adjustment, or undefined when the pair is not listed.
		 */
		lookup: (a, b) => pairs.get(`${a},${b}`),
	};
}

/**
 * Pair adjustment, format 2: a class matrix, every glyph belonging to a class
 * on each side.
 * @param buf The GPOS table.
 * @param off The subtable's offset.
 * @param r The reader, positioned after the format field.
 * @returns The subtable.
 */
function pairFormat2(buf: Buffer, off: number, r: Reader): PairSubtable {
	const cov = coverage(buf, off + r.u16());
	const vf1 = r.u16();
	const vf2 = r.u16();
	const cd1 = classDef(buf, off + r.u16());
	const cd2 = classDef(buf, off + r.u16());
	const class1Count = r.u16();
	const class2Count = r.u16();
	const recSize = valueRecordSize(vf1) + valueRecordSize(vf2);
	const base = r.p;
	const table: number[][] = [];
	for (let c1 = 0; c1 < class1Count; c1++) {
		const row: number[] = [];
		for (let c2 = 0; c2 < class2Count; c2++) {
			row.push(xAdvance(new Reader(buf, base + (c1 * class2Count + c2) * recSize), vf1));
		}
		table.push(row);
	}
	return {
		/**
		 * The class adjustment for a pair.
		 * @param a The first glyph.
		 * @param b The second glyph.
		 * @returns The adjustment, or undefined when the first glyph is not covered.
		 */
		lookup: (a, b) => {
			if (!cov.has(a)) {
				return undefined;
			}
			return table[cd1.get(a) ?? 0]?.[cd2.get(b) ?? 0];
		},
	};
}

/**
 * One pair-adjustment subtable of either format; any other format kerns
 * nothing.
 * @param buf The GPOS table.
 * @param off The subtable's offset.
 * @returns The subtable.
 */
function pairSubtable(buf: Buffer, off: number): PairSubtable {
	const r = new Reader(buf, off);
	const posFormat = r.u16();
	if (posFormat === 1) {
		return pairFormat1(buf, off, r);
	}
	if (posFormat === 2) {
		return pairFormat2(buf, off, r);
	}
	return {
		/**
		 * Never kerns.
		 * @returns Undefined.
		 */
		lookup: () => undefined,
	};
}

interface Kerning {
	/** The adjustment, in font units, between two adjacent glyphs. */
	kern(first: number, second: number): number;
}

/**
 * The pair-adjustment subtables of one `kern` lookup. Single positioning does
 * not move a pair, so only type 2 subtables are kept.
 * @param buf The GPOS table.
 * @param lookupOff The lookup's offset.
 * @returns The subtables.
 */
function pairSubtablesOf(buf: Buffer, lookupOff: number): PairSubtable[] {
	const lookup = readLookup(buf, lookupOff);
	const subtables: PairSubtable[] = [];
	for (const sub of lookup.subs) {
		const { type, off } = deExtend(buf, lookup.lookupType, sub, 9);
		if (type === 2) {
			subtables.push(pairSubtable(buf, off));
		}
	}
	return subtables;
}

/**
 * The pair kerning of one GPOS table: every `kern` lookup the default scripts
 * turn on.
 * @param buf The GPOS table.
 * @returns The kerning.
 */
function buildGpos(buf: Buffer): Kerning {
	const h = header(buf, SCRIPTS);
	const lookups: PairSubtable[][] = [];
	for (const index of lookupsForFeatures(buf, h, ["kern"])) {
		const subtables = pairSubtablesOf(buf, lookupOffsetAt(h, index));
		if (subtables.length > 0) {
			lookups.push(subtables);
		}
	}
	return {
		/**
		 * The kern between two glyphs. Each lookup applies once; inside a
		 * lookup the first matching subtable wins.
		 * @param first The first glyph.
		 * @param second The second glyph.
		 * @returns The adjustment in font units.
		 */
		kern(first: number, second: number): number {
			let total = 0;
			for (const subtables of lookups) {
				total += firstKern(subtables, first, second);
			}
			return total;
		},
	};
}

/**
 * The adjustment from the first subtable of a lookup that lists the pair.
 * @param subtables The lookup's subtables.
 * @param first The first glyph.
 * @param second The second glyph.
 * @returns The adjustment, 0 when no subtable lists the pair.
 */
function firstKern(subtables: readonly PairSubtable[], first: number, second: number): number {
	for (const subtable of subtables) {
		const value = subtable.lookup(first, second);
		if (value !== undefined) {
			return value;
		}
	}
	return 0;
}

export { type Kerning, buildGpos, type Substitutions, buildGsub };
