// GSUB: the substitutions that are on by default.
//
// `office`, `waffle`, `ffi` and `ffl` came out 1.82 px too wide without
// these. Excalifont reaches its ligatures through a chained contextual lookup
// (type 6) that fires a nested ligature lookup (type 4), so a reader handling
// only type 4 finds none of them.

import { Reader } from "@/runtime/engine/font-file";
import {
	type CoverageMap,
	SCRIPTS,
	coverage,
	deExtend,
	glyphsByCoverageIndex,
	header,
	lookupOffsetAt,
	lookupsForFeatures,
	readLookup,
	readOffsets,
} from "@/runtime/engine/lib/font-layout-tables";

// HarfBuzz's default-on horizontal features, minus the contextual ones
// (`calt`, `clig`, `rclt`), which Excalifont's GSUB declares none of.
const GSUB_DEFAULT = ["ccmp", "locl", "rlig", "liga"];

/** What one substitution produced. */
interface Hit {
	glyphs: number[];
	consumed: number;
}

interface Substitution {
	/** What replaces `glyphs[i]`, and how many glyphs it consumed. */
	apply(glyphs: readonly number[], i: number): Hit | null;
}

/** A nested lookup a chained rule fires at one position of its input. */
interface SubstRecord {
	sequenceIndex: number;
	lookupListIndex: number;
}

/**
 * The glyph at one position, or -1 past either end, which no table maps.
 * @param glyphs The run.
 * @param i The position.
 * @returns The glyph id.
 */
function glyphAt(glyphs: readonly number[], i: number): number {
	return glyphs[i] ?? -1;
}

/**
 * Whether the glyphs from `from` onwards equal a sequence.
 * @param glyphs The run.
 * @param from Where the sequence starts.
 * @param sequence The glyphs expected.
 * @returns True when every expected glyph is there.
 */
function matchesSequence(
	glyphs: readonly number[],
	from: number,
	sequence: readonly number[],
): boolean {
	return sequence.every((glyph, k) => glyphs[from + k] === glyph);
}

/**
 * Whether the glyphs from `from` onwards each fall in the matching coverage.
 * @param glyphs The run.
 * @param from Where the coverages start; a negative `step` walks backwards.
 * @param coverages The coverages expected.
 * @param step +1 forwards, -1 backwards.
 * @returns True when every position is covered.
 */
function matchesCoverages(
	glyphs: readonly number[],
	from: number,
	coverages: readonly CoverageMap[],
	step: 1 | -1,
): boolean {
	return coverages.every((map, k) => map.has(glyphAt(glyphs, from + step * k)));
}

/**
 * Single substitution (type 1): one glyph for another.
 * @param buf The GSUB table.
 * @param off The subtable's offset.
 * @returns The substitution.
 */
function singleSubst(buf: Buffer, off: number): Substitution {
	const r = new Reader(buf, off);
	const format = r.u16();
	const cov = coverage(buf, off + r.u16());
	const map = new Map<number, number>();
	if (format === 1) {
		const delta = r.i16();
		for (const g of cov.keys()) {
			map.set(g, (g + delta) & 0xffff);
		}
	} else {
		const subs = r.u16s(r.u16());
		for (const [g, i] of cov) {
			map.set(g, subs[i] ?? g);
		}
	}
	return {
		/**
		 * Replace the glyph at `i` when the table maps it.
		 * @param glyphs The run.
		 * @param i The position.
		 * @returns The replacement, or null.
		 */
		apply: (glyphs, i) => {
			const replacement = map.get(glyphAt(glyphs, i));
			return replacement === undefined ? null : { glyphs: [replacement], consumed: 1 };
		},
	};
}

/** One ligature: the glyphs after the first, and what they all become. */
interface Ligature {
	components: number[];
	glyph: number;
}

/**
 * The ligatures of one ligature set, in table order. OpenType has the font
 * list longer ligatures first so `ffi` wins over `ff`, and the shipped fonts
 * do; the order is taken as the font wrote it.
 * @param buf The GSUB table.
 * @param setOff The set's offset.
 * @returns The ligatures.
 */
function readLigatureSet(buf: Buffer, setOff: number): Ligature[] {
	const sr = new Reader(buf, setOff);
	const list: Ligature[] = [];
	for (const lo of readOffsets(sr, sr.u16(), setOff)) {
		const lr = new Reader(buf, lo);
		const glyph = lr.u16();
		const components = lr.u16s(lr.u16() - 1);
		list.push({ components, glyph });
	}
	return list;
}

/**
 * Ligature substitution (type 4): a run of glyphs for one.
 * @param buf The GSUB table.
 * @param off The subtable's offset.
 * @returns The substitution.
 */
function ligatureSubst(buf: Buffer, off: number): Substitution {
	const r = new Reader(buf, off);
	r.u16(); // substFormat
	const cov = coverage(buf, off + r.u16());
	const setOffsets = readOffsets(r, r.u16(), off);
	const byIndex = glyphsByCoverageIndex(cov);
	const ligatures = new Map<number, Ligature[]>();
	for (const [i, setOff] of setOffsets.entries()) {
		const first = byIndex.get(i);
		if (first !== undefined) {
			ligatures.set(first, readLigatureSet(buf, setOff));
		}
	}
	return {
		/**
		 * Replace the ligature starting at `i` when one matches.
		 * @param glyphs The run.
		 * @param i The position.
		 * @returns The ligature glyph, or null.
		 */
		apply(glyphs, i) {
			const list = ligatures.get(glyphAt(glyphs, i)) ?? [];
			const ligature = list.find((l) => matchesSequence(glyphs, i + 1, l.components));
			return ligature
				? { glyphs: [ligature.glyph], consumed: 1 + ligature.components.length }
				: null;
		},
	};
}

/**
 * Run the nested lookups a chained rule names over the matched input.
 * @param glyphs The run.
 * @param i Where the input starts.
 * @param inputCount How many glyphs the input spans.
 * @param records The nested lookups.
 * @param getLookup Resolves a lookup index.
 * @returns The rewritten input, consuming the whole span.
 */
function runNested(
	glyphs: readonly number[],
	i: number,
	inputCount: number,
	records: readonly SubstRecord[],
	getLookup: (index: number) => Substitution | null,
): Hit {
	let span = glyphs.slice(i, i + inputCount);
	for (const record of records) {
		const hit = getLookup(record.lookupListIndex)?.apply(span, record.sequenceIndex);
		if (hit) {
			span = [
				...span.slice(0, record.sequenceIndex),
				...hit.glyphs,
				...span.slice(record.sequenceIndex + hit.consumed),
			];
		}
	}
	return { glyphs: span, consumed: inputCount };
}

/** A format 1 chained rule: glyph sequences either side of the input. */
interface Rule {
	backtrack: number[];
	input: number[];
	lookahead: number[];
	records: SubstRecord[];
}

/**
 * Read the nested-lookup records of a chained rule.
 * @param rr The reader at the record count.
 * @returns The records.
 */
function readSubstRecords(rr: Reader): SubstRecord[] {
	const records: SubstRecord[] = [];
	for (let k = rr.u16(); k > 0; k--) {
		records.push({ sequenceIndex: rr.u16(), lookupListIndex: rr.u16() });
	}
	return records;
}

/**
 * The rules of one chained rule set, in table order, which is the order the
 * font wants them tried.
 * @param buf The GSUB table.
 * @param setOff The set's offset.
 * @returns The rules.
 */
function readRuleSet(buf: Buffer, setOff: number): Rule[] {
	const sr = new Reader(buf, setOff);
	const rules: Rule[] = [];
	for (const ro of readOffsets(sr, sr.u16(), setOff)) {
		const rr = new Reader(buf, ro);
		const backtrack = rr.u16s(rr.u16());
		const input = rr.u16s(rr.u16() - 1);
		const lookahead = rr.u16s(rr.u16());
		rules.push({ backtrack, input, lookahead, records: readSubstRecords(rr) });
	}
	return rules;
}

/**
 * Whether a rule's context matches around position `i`: the backtrack
 * glyphs before it, the input glyphs after it, and the lookahead after those.
 * @param glyphs The run.
 * @param i The position of the rule's first glyph.
 * @param rule The rule.
 * @returns True when all three sequences match.
 */
function ruleMatches(glyphs: readonly number[], i: number, rule: Rule): boolean {
	const backtrack = rule.backtrack.every((glyph, k) => glyphs[i - 1 - k] === glyph);
	return (
		backtrack &&
		matchesSequence(glyphs, i + 1, rule.input) &&
		matchesSequence(glyphs, i + 1 + rule.input.length, rule.lookahead)
	);
}

/**
 * Chained context, format 1: rules keyed by first glyph, matched by glyph.
 * @param buf The GSUB table.
 * @param off The subtable's offset.
 * @param r The reader, positioned after the format field.
 * @param getLookup Resolves a lookup index.
 * @returns The substitution.
 */
function chainFormat1(
	buf: Buffer,
	off: number,
	r: Reader,
	getLookup: (index: number) => Substitution | null,
): Substitution {
	const cov = coverage(buf, off + r.u16());
	const setOffsets = r.u16s(r.u16());
	const byIndex = glyphsByCoverageIndex(cov);
	const rulesByFirst = new Map<number, Rule[]>();
	for (const [i, setOffset] of setOffsets.entries()) {
		const first = byIndex.get(i);
		if (first !== undefined && setOffset) {
			rulesByFirst.set(first, readRuleSet(buf, off + setOffset));
		}
	}
	return {
		/**
		 * Fire the first rule whose context matches at `i`.
		 * @param glyphs The run.
		 * @param i The position.
		 * @returns The rewritten input, or null.
		 */
		apply(glyphs, i) {
			const rules = rulesByFirst.get(glyphAt(glyphs, i)) ?? [];
			const rule = rules.find((candidate) => ruleMatches(glyphs, i, candidate));
			return rule ? runNested(glyphs, i, rule.input.length + 1, rule.records, getLookup) : null;
		},
	};
}

/**
 * Read `count` coverage tables whose offsets follow.
 * @param buf The GSUB table.
 * @param off The subtable's offset the coverage offsets are relative to.
 * @param r The reader at the count.
 * @returns The coverages.
 */
function readCoverages(buf: Buffer, off: number, r: Reader): CoverageMap[] {
	const out: CoverageMap[] = [];
	for (let k = r.u16(); k > 0; k--) {
		out.push(coverage(buf, off + r.u16()));
	}
	return out;
}

/**
 * Chained context, format 3: one rule, matched by coverage at each position.
 * @param buf The GSUB table.
 * @param off The subtable's offset.
 * @param r The reader, positioned after the format field.
 * @param getLookup Resolves a lookup index.
 * @returns The substitution.
 */
function chainFormat3(
	buf: Buffer,
	off: number,
	r: Reader,
	getLookup: (index: number) => Substitution | null,
): Substitution {
	const backtrack = readCoverages(buf, off, r);
	const input = readCoverages(buf, off, r);
	const lookahead = readCoverages(buf, off, r);
	const records = readSubstRecords(r);
	return {
		/**
		 * Fire the rule when every coverage matches around `i`.
		 * @param glyphs The run.
		 * @param i The position.
		 * @returns The rewritten input, or null.
		 */
		apply(glyphs, i) {
			const matched =
				matchesCoverages(glyphs, i - 1, backtrack, -1) &&
				matchesCoverages(glyphs, i, input, 1) &&
				matchesCoverages(glyphs, i + input.length, lookahead, 1);
			return matched ? runNested(glyphs, i, input.length, records, getLookup) : null;
		},
	};
}

/**
 * Chained contextual substitution (type 6): a rule that fires other lookups
 * when the glyphs around a position match. Format 2 is class-based chaining;
 * no shipped family uses it, and measuring without it costs a substitution,
 * never a wrong one.
 * @param buf The GSUB table.
 * @param off The subtable's offset.
 * @param getLookup Resolves a lookup index.
 * @returns The substitution.
 */
function chainContextSubst(
	buf: Buffer,
	off: number,
	getLookup: (index: number) => Substitution | null,
): Substitution {
	const r = new Reader(buf, off);
	const format = r.u16();
	if (format === 1) {
		return chainFormat1(buf, off, r, getLookup);
	}
	if (format === 3) {
		return chainFormat3(buf, off, r, getLookup);
	}
	return {
		/**
		 * Never fires.
		 * @returns Null.
		 */
		apply: () => null,
	};
}

/**
 * The substitution one subtable implements, for the types this reader knows.
 * @param buf The GSUB table.
 * @param type The subtable's real type.
 * @param off The subtable's offset.
 * @param getLookup Resolves a lookup index.
 * @returns The substitution, or null for a type not read.
 */
function subtableFor(
	buf: Buffer,
	type: number,
	off: number,
	getLookup: (index: number) => Substitution | null,
): Substitution | null {
	if (type === 1) {
		return singleSubst(buf, off);
	}
	if (type === 4) {
		return ligatureSubst(buf, off);
	}
	if (type === 6) {
		return chainContextSubst(buf, off, getLookup);
	}
	return null;
}

/**
 * One lookup as a substitution: the first subtable that fires wins.
 * @param subtables The lookup's subtables.
 * @returns The substitution, or null when the lookup has none this reader knows.
 */
function firstFiring(subtables: readonly Substitution[]): Substitution | null {
	if (subtables.length === 0) {
		return null;
	}
	return {
		/**
		 * Apply the first subtable that fires at `i`.
		 * @param glyphs The run.
		 * @param i The position.
		 * @returns The hit, or null.
		 */
		apply(glyphs, i) {
			for (const subtable of subtables) {
				const hit = subtable.apply(glyphs, i);
				if (hit) {
					return hit;
				}
			}
			return null;
		},
	};
}

/**
 * Apply one lookup across a run, left to right, consuming what each hit says.
 * @param lookup The lookup.
 * @param glyphs The run.
 * @returns The run after the lookup.
 */
function applyLookup(lookup: Substitution, glyphs: readonly number[]): number[] {
	const next: number[] = [];
	let i = 0;
	while (i < glyphs.length) {
		const hit = lookup.apply(glyphs, i);
		if (hit) {
			next.push(...hit.glyphs);
			i += hit.consumed;
		} else {
			next.push(glyphAt(glyphs, i));
			i++;
		}
	}
	return next;
}

interface Substitutions {
	/** The glyph run after the default-on features have been applied. */
	substitute(glyphs: readonly number[]): number[];
}

/**
 * The default-on substitutions of one GSUB table.
 * @param buf The GSUB table.
 * @returns The substitutions.
 */
function buildGsub(buf: Buffer): Substitutions {
	const h = header(buf, SCRIPTS);
	const built = new Map<number, Substitution | null>();

	/**
	 * One lookup, built once; a placeholder is registered first so a cyclic
	 * reference terminates.
	 * @param index The lookup index.
	 * @returns The substitution, or null when the lookup has nothing this reader knows.
	 */
	function getLookup(index: number): Substitution | null {
		if (built.has(index)) {
			return built.get(index) ?? null;
		}
		built.set(index, null);
		const lookup = readLookup(buf, lookupOffsetAt(h, index));
		const subtables: Substitution[] = [];
		for (const sub of lookup.subs) {
			const { type, off } = deExtend(buf, lookup.lookupType, sub, 7);
			const subtable = subtableFor(buf, type, off, getLookup);
			if (subtable) {
				subtables.push(subtable);
			}
		}
		const substitution = firstFiring(subtables);
		built.set(index, substitution);
		return substitution;
	}

	const lookups = lookupsForFeatures(buf, h, GSUB_DEFAULT)
		.map(getLookup)
		.filter((lookup): lookup is Substitution => lookup !== null);

	return {
		/**
		 * Apply every default-on lookup in order.
		 * @param glyphs The run.
		 * @returns The run after substitution.
		 */
		substitute(glyphs: readonly number[]): number[] {
			let out = [...glyphs];
			for (const lookup of lookups) {
				out = applyLookup(lookup, out);
			}
			return out;
		},
	};
}

export { type Substitution, type Substitutions, buildGsub };
