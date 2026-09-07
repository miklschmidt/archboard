// The OpenType structures GPOS and GSUB share: coverage and class tables,
// value records, and the script/feature/lookup header that says which
// lookups a font turns on by default.

import { Reader } from "@/runtime/engine/font-file";

// The scripts whose default LangSys decides which lookups apply. A feature no
// matching script references is off, which is how a font ships a feature for
// Turkish without it firing on English.
const SCRIPTS = ["DFLT", "latn", "cyrl", "grek"];

type CoverageMap = Map<number, number>;

/**
 * A coverage table: which glyphs a subtable applies to, each with its
 * coverage index.
 * @param buf The layout table.
 * @param off The coverage table's offset.
 * @returns Glyph id to coverage index.
 * @throws {Error} When the format is not 1 or 2.
 */
function coverage(buf: Buffer, off: number): CoverageMap {
	const r = new Reader(buf, off);
	const format = r.u16();
	const map: CoverageMap = new Map();
	if (format === 1) {
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			map.set(r.u16(), i);
		}
	} else if (format === 2) {
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			const start = r.u16();
			const end = r.u16();
			const index = r.u16();
			for (let g = start; g <= end; g++) {
				map.set(g, index + (g - start));
			}
		}
	} else {
		throw new Error(`coverage format ${format} is not one this reader knows`);
	}
	return map;
}

/**
 * A class definition table: which class each glyph belongs to.
 * @param buf The layout table.
 * @param off The class table's offset.
 * @returns Glyph id to class.
 * @throws {Error} When the format is not 1 or 2.
 */
function classDef(buf: Buffer, off: number): Map<number, number> {
	const r = new Reader(buf, off);
	const format = r.u16();
	const map = new Map<number, number>();
	if (format === 1) {
		const start = r.u16();
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			map.set(start + i, r.u16());
		}
	} else if (format === 2) {
		const n = r.u16();
		for (let i = 0; i < n; i++) {
			const start = r.u16();
			const end = r.u16();
			const cls = r.u16();
			for (let g = start; g <= end; g++) {
				map.set(g, cls);
			}
		}
	} else {
		throw new Error(`classDef format ${format} is not one this reader knows`);
	}
	return map;
}

/**
 * The size of a ValueRecord, a bitmask of present fields, each a uint16.
 * @param format The value format bitmask.
 * @returns The record's size in bytes.
 */
function valueRecordSize(format: number): number {
	let n = 0;
	for (let bit = 0; bit < 16; bit++) {
		if (format & (1 << bit)) {
			n += 2;
		}
	}
	return n;
}

/**
 * Read a ValueRecord and keep only the one field that changes a width.
 * @param r A reader at the record.
 * @param format The value format bitmask.
 * @returns The XAdvance, 0 when absent.
 */
function xAdvance(r: Reader, format: number): number {
	let x = 0;
	for (let bit = 0; bit < 16; bit++) {
		if (!(format & (1 << bit))) {
			continue;
		}
		const value = r.i16();
		if (1 << bit === 0x0004) {
			x = value;
		} // XAdvance
	}
	return x;
}

interface Header {
	features: Array<{ index: number; tag: string; off: number }>;
	/** Feature indices the wanted scripts' default LangSys references. */
	wanted: Set<number>;
	lookupOffsets: number[];
}

/**
 * The feature indices a script's default LangSys references.
 * @param buf The layout table.
 * @param off The script table's offset.
 * @param wanted The set to add them to.
 */
function addDefaultLangSysFeatures(buf: Buffer, off: number, wanted: Set<number>): void {
	const sr = new Reader(buf, off);
	const defaultLangSys = sr.u16();
	if (!defaultLangSys) {
		return;
	}
	const lr = new Reader(buf, off + defaultLangSys);
	lr.u16();
	lr.u16(); // lookupOrder, requiredFeatureIndex
	const n = lr.u16();
	for (let j = 0; j < n; j++) {
		wanted.add(lr.u16());
	}
}

/**
 * The feature indices the wanted scripts turn on by default.
 * @param buf The layout table.
 * @param scriptListOffset The script list's offset.
 * @param scripts The script tags that count.
 * @returns The feature indices.
 */
function wantedFeatures(
	buf: Buffer,
	scriptListOffset: number,
	scripts: readonly string[],
): Set<number> {
	const sl = new Reader(buf, scriptListOffset);
	const scriptCount = sl.u16();
	const wanted = new Set<number>();
	for (let i = 0; i < scriptCount; i++) {
		const tag = sl.tag();
		const off = scriptListOffset + sl.u16();
		if (scripts.includes(tag)) {
			addDefaultLangSysFeatures(buf, off, wanted);
		}
	}
	return wanted;
}

/**
 * GPOS and GSUB share a header: script list, feature list, lookup list.
 * @param buf The layout table.
 * @param scripts The script tags whose defaults decide what is wanted.
 * @returns The header.
 */
function header(buf: Buffer, scripts: readonly string[]): Header {
	const r = new Reader(buf);
	r.u16();
	r.u16(); // version
	const scriptListOffset = r.u16();
	const featureListOffset = r.u16();
	const lookupListOffset = r.u16();
	const wanted = wantedFeatures(buf, scriptListOffset, scripts);

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
	for (let i = 0; i < lookupCount; i++) {
		lookupOffsets.push(lookupListOffset + ll.u16());
	}
	return { features, wanted, lookupOffsets };
}

/**
 * The lookup indices the named features reach, in lookup order, restricted
 * to features the wanted scripts reference when any script says so.
 * @param buf The layout table.
 * @param h The header.
 * @param tags The feature tags.
 * @returns The lookup indices, ascending.
 */
function lookupsForFeatures(buf: Buffer, h: Header, tags: readonly string[]): number[] {
	const indices = new Set<number>();
	for (const feature of h.features) {
		if (!tags.includes(feature.tag)) {
			continue;
		}
		if (h.wanted.size > 0 && !h.wanted.has(feature.index)) {
			continue;
		}
		const fr = new Reader(buf, feature.off);
		fr.u16(); // featureParams
		const n = fr.u16();
		for (let i = 0; i < n; i++) {
			indices.add(fr.u16());
		}
	}
	return [...indices].toSorted((a, b) => a - b);
}

/**
 * The offset of one lookup in the lookup list.
 * @param h The header.
 * @param index The lookup index.
 * @returns The offset.
 * @throws {Error} When the index is past the list.
 */
function lookupOffsetAt(h: Header, index: number): number {
	const off = h.lookupOffsets[index];
	if (off === undefined) {
		throw new Error(`lookup index ${index} is past the lookup list`);
	}
	return off;
}

/**
 * One lookup: its type and its subtables' offsets.
 * @param buf The layout table.
 * @param off The lookup's offset.
 * @returns The type and subtable offsets.
 */
function readLookup(buf: Buffer, off: number): { lookupType: number; subs: number[] } {
	const r = new Reader(buf, off);
	const lookupType = r.u16();
	r.u16(); // lookupFlag
	const subCount = r.u16();
	const subs: number[] = [];
	for (let i = 0; i < subCount; i++) {
		subs.push(off + r.u16());
	}
	return { lookupType, subs };
}

/**
 * Resolve an extension subtable, an indirection to a subtable of another
 * type; any other subtable comes back as it is.
 * @param buf The layout table.
 * @param type The lookup type.
 * @param off The subtable's offset.
 * @param extensionType The lookup type that means "extension" in this table.
 * @returns The real type and offset.
 */
function deExtend(
	buf: Buffer,
	type: number,
	off: number,
	extensionType: number,
): { type: number; off: number } {
	if (type !== extensionType) {
		return { type, off };
	}
	const r = new Reader(buf, off);
	r.u16(); // format
	const inner = r.u16();
	const delta = r.u32();
	return { type: inner, off: off + delta };
}

/**
 * Read `count` offsets relative to `base`.
 * @param r The reader at the offsets.
 * @param count How many.
 * @param base What they are relative to.
 * @returns Absolute offsets.
 */
function readOffsets(r: Reader, count: number, base: number): number[] {
	const offsets: number[] = [];
	for (let i = 0; i < count; i++) {
		offsets.push(base + r.u16());
	}
	return offsets;
}

/**
 * The glyph at each coverage index.
 * @param cov The coverage map.
 * @returns Coverage index to glyph id.
 */
function glyphsByCoverageIndex(cov: CoverageMap): Map<number, number> {
	const byIndex = new Map<number, number>();
	for (const [g, i] of cov) {
		byIndex.set(i, g);
	}
	return byIndex;
}

export {
	type CoverageMap,
	type Header,
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
};
