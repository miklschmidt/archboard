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
//               4), so a reader handling only type 4 finds none of them.
//
// What deliberately is not here: `calt`, `clig` and `rclt`. HarfBuzz has them
// on by default and Excalifont's GSUB declares none of them, so implementing
// them would be guessing at behaviour nothing on disk exercises. A family that
// used one would measure slightly wide, which is the failure to prefer over a
// wrong contextual rule applied everywhere.

import { Reader } from "./font-file.js";

// The scripts whose default LangSys decides which lookups apply. A feature no
// matching script references is off, which is how a font ships a feature for
// Turkish without it firing on English.
const SCRIPTS = ["DFLT", "latn", "cyrl", "grek"];

// HarfBuzz's default-on horizontal features, minus the contextual ones above.
const GSUB_DEFAULT = ["ccmp", "locl", "rlig", "liga"];

type CoverageMap = Map<number, number>;

function coverage(buf: Buffer, off: number): CoverageMap {
	const r = new Reader(buf, off);
	const format = r.u16();
	const map: CoverageMap = new Map();
	if (format === 1) {
		const n = r.u16();
		for (let i = 0; i < n; i++) map.set(r.u16(), i);
	} else if (format === 2) {
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			const start = r.u16();
			const end = r.u16();
			const index = r.u16();
			for (let g = start; g <= end; g++) map.set(g, index + (g - start));
		}
	} else {
		throw new Error(`coverage format ${format} is not one this reader knows`);
	}
	return map;
}

function classDef(buf: Buffer, off: number): Map<number, number> {
	const r = new Reader(buf, off);
	const format = r.u16();
	const map = new Map<number, number>();
	if (format === 1) {
		const start = r.u16();
		const n = r.u16();
		for (let i = 0; i < n; i++) map.set(start + i, r.u16());
	} else if (format === 2) {
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			const start = r.u16();
			const end = r.u16();
			const cls = r.u16();
			for (let g = start; g <= end; g++) map.set(g, cls);
		}
	} else {
		throw new Error(`classDef format ${format} is not one this reader knows`);
	}
	return map;
}

/** A ValueRecord is a bitmask of present fields, each a uint16. */
function valueRecordSize(format: number): number {
	let n = 0;
	for (let bit = 0; bit < 16; bit++) if (format & (1 << bit)) n += 2;
	return n;
}

/** Read a ValueRecord and keep only the one field that changes a width. */
function xAdvance(r: Reader, format: number): number {
	let x = 0;
	for (let bit = 0; bit < 16; bit++) {
		if (!(format & (1 << bit))) continue;
		const value = r.i16();
		if (1 << bit === 0x0004) x = value; // XAdvance
	}
	return x;
}

interface Header {
	features: Array<{ index: number; tag: string; off: number }>;
	/** Feature indices the wanted scripts' default LangSys references. */
	wanted: Set<number>;
	lookupOffsets: number[];
}

/** GPOS and GSUB share a header: script list, feature list, lookup list. */
function header(buf: Buffer, scripts: readonly string[]): Header {
	const r = new Reader(buf);
	r.u16();
	r.u16(); // version
	const scriptListOffset = r.u16();
	const featureListOffset = r.u16();
	const lookupListOffset = r.u16();

	const sl = new Reader(buf, scriptListOffset);
	const scriptCount = sl.u16();
	const wanted = new Set<number>();
	for (let i = 0; i < scriptCount; i++) {
		const tag = sl.tag();
		const off = scriptListOffset + sl.u16();
		if (!scripts.includes(tag)) continue;
		const sr = new Reader(buf, off);
		const defaultLangSys = sr.u16();
		if (!defaultLangSys) continue;
		const lr = new Reader(buf, off + defaultLangSys);
		lr.u16();
		lr.u16(); // lookupOrder, requiredFeatureIndex
		const n = lr.u16();
		for (let j = 0; j < n; j++) wanted.add(lr.u16());
	}

	const fl = new Reader(buf, featureListOffset);
	const featureCount = fl.u16();
	const features: Header["features"] = [];
	for (let i = 0; i < featureCount; i++) {
		const tag = fl.tag();
		features.push({ index: i, tag, off: featureListOffset + fl.u16() });
	}

	const ll = new Reader(buf, lookupListOffset);
	const lookupCount = ll.u16();
	const lookupOffsets: number[] = [];
	for (let i = 0; i < lookupCount; i++) lookupOffsets.push(lookupListOffset + ll.u16());

	return { features, wanted, lookupOffsets };
}

function lookupsForFeatures(buf: Buffer, h: Header, tags: readonly string[]): number[] {
	const indices = new Set<number>();
	for (const feature of h.features) {
		if (!tags.includes(feature.tag)) continue;
		if (h.wanted.size > 0 && !h.wanted.has(feature.index)) continue;
		const fr = new Reader(buf, feature.off);
		fr.u16(); // featureParams
		const n = fr.u16();
		for (let i = 0; i < n; i++) indices.add(fr.u16());
	}
	return [...indices].toSorted((a, b) => a - b);
}

function readLookup(buf: Buffer, off: number): { lookupType: number; subs: number[] } {
	const r = new Reader(buf, off);
	const lookupType = r.u16();
	r.u16(); // lookupFlag
	const subCount = r.u16();
	const subs: number[] = [];
	for (let i = 0; i < subCount; i++) subs.push(off + r.u16());
	return { lookupType, subs };
}

/** An extension subtable is an indirection to a subtable of another type. */
function deExtend(
	buf: Buffer,
	type: number,
	off: number,
	extensionType: number,
): { type: number; off: number } {
	if (type !== extensionType) return { type, off };
	const r = new Reader(buf, off);
	r.u16(); // format
	const inner = r.u16();
	const delta = r.u32();
	return { type: inner, off: off + delta };
}

// ── GPOS: pair kerning ──────────────────────────────────────────────────────

interface PairSubtable {
	lookup(first: number, second: number): number | undefined;
}

function pairSubtable(buf: Buffer, off: number): PairSubtable {
	const r = new Reader(buf, off);
	const posFormat = r.u16();

	if (posFormat === 1) {
		// Explicit pairs, listed per first glyph.
		const cov = coverage(buf, off + r.u16());
		const vf1 = r.u16();
		const vf2 = r.u16();
		const pairSetCount = r.u16();
		const offsets: number[] = [];
		for (let i = 0; i < pairSetCount; i++) offsets.push(off + r.u16());
		const byIndex = new Map<number, number>();
		for (const [g, i] of cov) byIndex.set(i, g);
		const pairs = new Map<string, number>();
		for (let i = 0; i < pairSetCount; i++) {
			const first = byIndex.get(i);
			if (first === undefined) continue;
			const pr = new Reader(buf, offsets[i] as number);
			const n = pr.u16();
			for (let j = 0; j < n; j++) {
				const second = pr.u16();
				const value = xAdvance(pr, vf1);
				xAdvance(pr, vf2);
				pairs.set(`${first},${second}`, value);
			}
		}
		return { lookup: (a, b) => pairs.get(`${a},${b}`) };
	}

	if (posFormat === 2) {
		// A class matrix: every glyph belongs to a class on each side.
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
			lookup: (a, b) => {
				if (!cov.has(a)) return undefined;
				return table[cd1.get(a) ?? 0]?.[cd2.get(b) ?? 0];
			},
		};
	}

	return { lookup: () => undefined };
}

export interface Kerning {
	/** The adjustment, in font units, between two adjacent glyphs. */
	kern(first: number, second: number): number;
}

export function buildGpos(buf: Buffer): Kerning {
	const h = header(buf, SCRIPTS);
	const lookups: PairSubtable[][] = [];
	for (const index of lookupsForFeatures(buf, h, ["kern"])) {
		const lookup = readLookup(buf, h.lookupOffsets[index] as number);
		const subtables: PairSubtable[] = [];
		for (const sub of lookup.subs) {
			const { type, off } = deExtend(buf, lookup.lookupType, sub, 9);
			if (type !== 2) continue; // single positioning does not move a pair
			subtables.push(pairSubtable(buf, off));
		}
		if (subtables.length > 0) lookups.push(subtables);
	}

	return {
		// Each lookup applies once; inside a lookup the first matching subtable wins.
		kern(first: number, second: number): number {
			let total = 0;
			for (const subtables of lookups) {
				for (const subtable of subtables) {
					const value = subtable.lookup(first, second);
					if (value !== undefined) {
						total += value;
						break;
					}
				}
			}
			return total;
		},
	};
}

// ── GSUB: the substitutions that are on by default ──────────────────────────

interface Substitution {
	/** What replaces `glyphs[i]`, and how many glyphs it consumed. */
	apply(glyphs: readonly number[], i: number): { glyphs: number[]; consumed: number } | null;
}

function singleSubst(buf: Buffer, off: number): Substitution {
	const r = new Reader(buf, off);
	const format = r.u16();
	const cov = coverage(buf, off + r.u16());
	const map = new Map<number, number>();
	if (format === 1) {
		const delta = r.i16();
		for (const g of cov.keys()) map.set(g, (g + delta) & 0xffff);
	} else {
		const n = r.u16();
		const subs: number[] = [];
		for (let i = 0; i < n; i++) subs.push(r.u16());
		for (const [g, i] of cov) map.set(g, subs[i] as number);
	}
	return {
		apply: (glyphs, i) => {
			const replacement = map.get(glyphs[i] as number);
			return replacement === undefined ? null : { glyphs: [replacement], consumed: 1 };
		},
	};
}

function ligatureSubst(buf: Buffer, off: number): Substitution {
	const r = new Reader(buf, off);
	r.u16(); // substFormat
	const cov = coverage(buf, off + r.u16());
	const setCount = r.u16();
	const setOffsets: number[] = [];
	for (let i = 0; i < setCount; i++) setOffsets.push(off + r.u16());
	const byIndex = new Map<number, number>();
	for (const [g, i] of cov) byIndex.set(i, g);

	const ligatures = new Map<number, Array<{ components: number[]; glyph: number }>>();
	for (let i = 0; i < setCount; i++) {
		const first = byIndex.get(i);
		if (first === undefined) continue;
		const setOff = setOffsets[i] as number;
		const sr = new Reader(buf, setOff);
		const n = sr.u16();
		const offsets: number[] = [];
		for (let j = 0; j < n; j++) offsets.push(setOff + sr.u16());
		const list: Array<{ components: number[]; glyph: number }> = [];
		for (const lo of offsets) {
			const lr = new Reader(buf, lo);
			const glyph = lr.u16();
			const compCount = lr.u16();
			const components: number[] = [];
			for (let k = 1; k < compCount; k++) components.push(lr.u16());
			list.push({ components, glyph });
		}
		// Longest first, so `ffi` wins over `ff`.
		list.toSorted((a, b) => b.components.length - a.components.length);
		ligatures.set(first, list);
	}

	return {
		apply(glyphs, i) {
			const list = ligatures.get(glyphs[i] as number);
			if (!list) return null;
			for (const ligature of list) {
				let matched = true;
				for (let k = 0; k < ligature.components.length; k++) {
					if (glyphs[i + 1 + k] !== ligature.components[k]) {
						matched = false;
						break;
					}
				}
				if (matched) return { glyphs: [ligature.glyph], consumed: 1 + ligature.components.length };
			}
			return null;
		},
	};
}

/**
 * Chained contextual substitution — a rule that fires other lookups when the
 * glyphs around a position match.
 *
 * This is here because Excalifont's `liga` is one: a type 6 rule whose nested
 * lookup is the type 4 above. Without it the ligature table is unreachable and
 * `office` measures 1.82 px too wide.
 */
function chainContextSubst(
	buf: Buffer,
	off: number,
	getLookup: (index: number) => Substitution | null,
): Substitution {
	const r = new Reader(buf, off);
	const format = r.u16();

	const runNested = (
		glyphs: readonly number[],
		i: number,
		inputCount: number,
		records: Array<{ sequenceIndex: number; lookupListIndex: number }>,
	) => {
		let span = glyphs.slice(i, i + inputCount);
		for (const record of records) {
			const lookup = getLookup(record.lookupListIndex);
			if (!lookup) continue;
			const hit = lookup.apply(span, record.sequenceIndex);
			if (hit) {
				span = [
					...span.slice(0, record.sequenceIndex),
					...hit.glyphs,
					...span.slice(record.sequenceIndex + hit.consumed),
				];
			}
		}
		return { glyphs: span, consumed: inputCount };
	};

	if (format === 1) {
		const cov = coverage(buf, off + r.u16());
		const setCount = r.u16();
		const setOffsets: number[] = [];
		for (let i = 0; i < setCount; i++) setOffsets.push(r.u16());
		const byIndex = new Map<number, number>();
		for (const [g, i] of cov) byIndex.set(i, g);

		interface Rule {
			backtrack: number[];
			input: number[];
			lookahead: number[];
			records: Array<{ sequenceIndex: number; lookupListIndex: number }>;
		}
		const rulesByFirst = new Map<number, Rule[]>();
		for (let i = 0; i < setCount; i++) {
			const first = byIndex.get(i);
			if (first === undefined || !setOffsets[i]) continue;
			const setOff = off + (setOffsets[i] as number);
			const sr = new Reader(buf, setOff);
			const n = sr.u16();
			const offsets: number[] = [];
			for (let j = 0; j < n; j++) offsets.push(setOff + sr.u16());
			const rules: Rule[] = [];
			for (const ro of offsets) {
				const rr = new Reader(buf, ro);
				const backtrack: number[] = [];
				for (let k = rr.u16(); k > 0; k--) backtrack.push(rr.u16());
				const input: number[] = [];
				for (let k = rr.u16() - 1; k > 0; k--) input.push(rr.u16());
				const lookahead: number[] = [];
				for (let k = rr.u16(); k > 0; k--) lookahead.push(rr.u16());
				const records: Array<{ sequenceIndex: number; lookupListIndex: number }> = [];
				for (let k = rr.u16(); k > 0; k--) {
					records.push({ sequenceIndex: rr.u16(), lookupListIndex: rr.u16() });
				}
				rules.push({ backtrack, input, lookahead, records });
			}
			rules.toSorted((a, b) => b.input.length - a.input.length);
			rulesByFirst.set(first, rules);
		}

		return {
			apply(glyphs, i) {
				const rules = rulesByFirst.get(glyphs[i] as number);
				if (!rules) return null;
				for (const rule of rules) {
					let matched = true;
					for (let k = 0; k < rule.backtrack.length; k++) {
						if (glyphs[i - 1 - k] !== rule.backtrack[k]) {
							matched = false;
							break;
						}
					}
					if (matched) {
						for (let k = 0; k < rule.input.length; k++) {
							if (glyphs[i + 1 + k] !== rule.input[k]) {
								matched = false;
								break;
							}
						}
					}
					const inputCount = rule.input.length + 1;
					if (matched) {
						for (let k = 0; k < rule.lookahead.length; k++) {
							if (glyphs[i + inputCount + k] !== rule.lookahead[k]) {
								matched = false;
								break;
							}
						}
					}
					if (matched) return runNested(glyphs, i, inputCount, rule.records);
				}
				return null;
			},
		};
	}

	if (format === 3) {
		const backtrack: CoverageMap[] = [];
		for (let k = r.u16(); k > 0; k--) backtrack.push(coverage(buf, off + r.u16()));
		const input: CoverageMap[] = [];
		for (let k = r.u16(); k > 0; k--) input.push(coverage(buf, off + r.u16()));
		const lookahead: CoverageMap[] = [];
		for (let k = r.u16(); k > 0; k--) lookahead.push(coverage(buf, off + r.u16()));
		const records: Array<{ sequenceIndex: number; lookupListIndex: number }> = [];
		for (let k = r.u16(); k > 0; k--) {
			records.push({ sequenceIndex: r.u16(), lookupListIndex: r.u16() });
		}
		return {
			apply(glyphs, i) {
				for (let k = 0; k < backtrack.length; k++) {
					if (!(backtrack[k] as CoverageMap).has(glyphs[i - 1 - k] as number)) return null;
				}
				for (let k = 0; k < input.length; k++) {
					if (!(input[k] as CoverageMap).has(glyphs[i + k] as number)) return null;
				}
				for (let k = 0; k < lookahead.length; k++) {
					if (!(lookahead[k] as CoverageMap).has(glyphs[i + input.length + k] as number))
						return null;
				}
				return runNested(glyphs, i, input.length, records);
			},
		};
	}

	// Format 2 is class-based chaining. No shipped family uses it; measuring
	// without it costs a substitution, never a wrong one.
	return { apply: () => null };
}

export interface Substitutions {
	/** The glyph run after the default-on features have been applied. */
	substitute(glyphs: readonly number[]): number[];
}

export function buildGsub(buf: Buffer): Substitutions {
	const h = header(buf, SCRIPTS);
	const built = new Map<number, Substitution | null>();

	function getLookup(index: number): Substitution | null {
		if (built.has(index)) return built.get(index) as Substitution | null;
		built.set(index, null); // a placeholder, so a cyclic reference terminates
		const lookup = readLookup(buf, h.lookupOffsets[index] as number);
		const subtables: Substitution[] = [];
		for (const sub of lookup.subs) {
			const { type, off } = deExtend(buf, lookup.lookupType, sub, 7);
			if (type === 1) subtables.push(singleSubst(buf, off));
			else if (type === 4) subtables.push(ligatureSubst(buf, off));
			else if (type === 6) subtables.push(chainContextSubst(buf, off, getLookup));
		}
		const built1: Substitution | null =
			subtables.length > 0
				? {
						apply(glyphs, i) {
							for (const subtable of subtables) {
								const hit = subtable.apply(glyphs, i);
								if (hit) return hit;
							}
							return null;
						},
					}
				: null;
		built.set(index, built1);
		return built1;
	}

	const lookups = lookupsForFeatures(buf, h, GSUB_DEFAULT)
		.map(getLookup)
		.filter((lookup): lookup is Substitution => lookup !== null);

	return {
		substitute(glyphs: readonly number[]): number[] {
			let out = [...glyphs];
			for (const lookup of lookups) {
				const next: number[] = [];
				let i = 0;
				while (i < out.length) {
					const hit = lookup.apply(out, i);
					if (hit) {
						next.push(...hit.glyphs);
						i += hit.consumed;
					} else {
						next.push(out[i] as number);
						i++;
					}
				}
				out = next;
			}
			return out;
		},
	};
}
