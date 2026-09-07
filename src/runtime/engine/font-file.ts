// Enough of a WOFF2 reader to answer "how wide is this glyph".
//
// Excalidraw ships its fonts as woff2 subsets inside its own package, and
// under ADR 0015 the server has to arrive at the same width for a piece of
// text that Chrome does, with no browser open. Chrome's width is the sum of
// advance widths with OpenType layout applied on top, so the tables that
// matter are `head` (units per em), `maxp` (glyph count), `hhea` and `hmtx`
// (advances), `cmap` (codepoint to glyph) and `GPOS`/`GSUB` (kerning and
// ligatures, read by font-layout.ts).
//
// This is small for one reason: woff2 stores those tables untransformed. Only
// `glyf` and `loca` carry a transform, and outlines are not needed to measure.
// So the whole container is a directory, one brotli stream — `node:zlib` has
// brotli built in — and a set of subarrays. No native dependency, no package.
//
// Measured against Chrome on 63,175 ASCII pairs across the seven families
// Excalidraw ships as files, worst disagreement 0.02 px
// (docs/design/measuring-text-outside-a-browser.md).

import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

// The woff2 spec's table-tag index. A directory entry either names its tag by
// position in this list or spells it out.
const KNOWN_TAGS = [
	"cmap",
	"head",
	"hhea",
	"hmtx",
	"maxp",
	"name",
	"OS/2",
	"post",
	"cvt ",
	"fpgm",
	"glyf",
	"loca",
	"prep",
	"CFF ",
	"VORG",
	"EBDT",
	"EBLC",
	"gasp",
	"hdmx",
	"kern",
	"LTSH",
	"PCLT",
	"VDMX",
	"vhea",
	"vmtx",
	"BASE",
	"GDEF",
	"GPOS",
	"GSUB",
	"EBSC",
	"JSTF",
	"MATH",
	"CBDT",
	"CBLC",
	"COLR",
	"CPAL",
	"SVG ",
	"sbix",
	"acnt",
	"avar",
	"bdat",
	"bloc",
	"bsln",
	"cvar",
	"fdsc",
	"feat",
	"fmtx",
	"fvar",
	"gvar",
	"hsty",
	"just",
	"lcar",
	"mort",
	"morx",
	"opbd",
	"prop",
	"trak",
	"Zapf",
	"Silf",
	"Glat",
	"Gloc",
	"Feat",
	"Sill",
];

/** A cursor over big-endian font data. Every table format below is one. */
class Reader {
	readonly b: Buffer;
	p: number;

	/**
	 * A cursor over a buffer.
	 * @param buf The data.
	 * @param pos Where to start.
	 */
	constructor(buf: Buffer, pos = 0) {
		this.b = buf;
		this.p = pos;
	}

	/**
	 * Read one unsigned byte.
	 * @returns The value.
	 */
	u8(): number {
		const v = this.b.readUInt8(this.p);
		this.p += 1;
		return v;
	}

	/**
	 * Read one unsigned 16-bit integer.
	 * @returns The value.
	 */
	u16(): number {
		const v = this.b.readUInt16BE(this.p);
		this.p += 2;
		return v;
	}

	/**
	 * Read one signed 16-bit integer.
	 * @returns The value.
	 */
	i16(): number {
		const v = this.b.readInt16BE(this.p);
		this.p += 2;
		return v;
	}

	/**
	 * Read one unsigned 32-bit integer.
	 * @returns The value.
	 */
	u32(): number {
		const v = this.b.readUInt32BE(this.p);
		this.p += 4;
		return v;
	}

	/**
	 * Read a four-character table tag.
	 * @returns The tag.
	 */
	tag(): string {
		const v = this.b.toString("ascii", this.p, this.p + 4);
		this.p += 4;
		return v;
	}

	/**
	 * Read `count` unsigned 16-bit integers.
	 * @param count How many.
	 * @returns The values.
	 */
	u16s(count: number): number[] {
		const out: number[] = [];
		for (let i = 0; i < count; i++) {
			out.push(this.u16());
		}
		return out;
	}

	/**
	 * Read woff2's variable-length unsigned integer.
	 * @returns The value.
	 * @throws {Error} When the integer runs past five bytes.
	 */
	base128(): number {
		let v = 0;
		for (let i = 0; i < 5; i++) {
			const byte = this.u8();
			v = (v << 7) | (byte & 0x7f);
			if ((byte & 0x80) === 0) {
				return v >>> 0;
			}
		}
		throw new Error("UIntBase128 is longer than five bytes");
	}
}

interface DirectoryEntry {
	tag: string;
	transformVersion: number;
	origLength: number;
	transformLength: number | null;
}

interface FontTable {
	buf: Buffer;
	transformVersion: number;
}

/**
 * The woff2 header after the signature: how many tables follow and how long
 * the compressed data is. Everything else in it is skipped.
 * @param r A reader positioned after `wOF2`.
 * @returns The table count and the compressed size.
 */
function readHeader(r: Reader): { numTables: number; totalCompressedSize: number } {
	r.u32(); // flavor
	r.u32(); // length
	const numTables = r.u16();
	r.u16(); // reserved
	r.u32(); // totalSfntSize
	const totalCompressedSize = r.u32();
	r.u16();
	r.u16(); // major/minor version
	r.u32();
	r.u32();
	r.u32(); // metaOffset, metaLength, metaOrigLength
	r.u32();
	r.u32(); // privOffset, privLength
	return { numTables, totalCompressedSize };
}

/**
 * The tag of one directory entry: spelt out when the index says so, else
 * looked up in the spec's list.
 * @param r The reader, positioned after the flags byte.
 * @param tagIndex The low six bits of the flags.
 * @returns The tag.
 * @throws {Error} When the index names no known tag.
 */
function readTag(r: Reader, tagIndex: number): string {
	if (tagIndex === 63) {
		return r.tag();
	}
	const tag = KNOWN_TAGS[tagIndex];
	if (tag === undefined) {
		throw new Error(`woff2 directory names an unknown table index ${tagIndex}`);
	}
	return tag;
}

/**
 * One table directory entry. `glyf` and `loca` are transformed unless the
 * version says otherwise; every other table is the other way round.
 * @param r The reader, positioned at the entry.
 * @returns The entry.
 */
function readDirectoryEntry(r: Reader): DirectoryEntry {
	const flags = r.u8();
	const transformVersion = (flags >> 6) & 0x03;
	const tag = readTag(r, flags & 0x3f);
	const origLength = r.base128();
	const nullTransform =
		tag === "glyf" || tag === "loca" ? transformVersion === 3 : transformVersion === 0;
	const transformLength = nullTransform ? null : r.base128();
	return { tag, transformVersion, origLength, transformLength };
}

/**
 * The tables of one woff2 file, decompressed and cut apart.
 * @param path The woff2 file.
 * @returns The tables by tag.
 * @throws {Error} When the file is not woff2.
 */
function readWoff2(path: string): Record<string, FontTable> {
	const buf = readFileSync(path);
	if (buf.length < 48 || buf.toString("ascii", 0, 4) !== "wOF2") {
		throw new Error(`${path} is not a woff2 file`);
	}
	const r = new Reader(buf, 4);
	const { numTables, totalCompressedSize } = readHeader(r);
	const directory: DirectoryEntry[] = [];
	for (let i = 0; i < numTables; i++) {
		directory.push(readDirectoryEntry(r));
	}
	const data = brotliDecompressSync(buf.subarray(r.p, r.p + totalCompressedSize));
	const tables: Record<string, FontTable> = {};
	let offset = 0;
	for (const entry of directory) {
		const length = entry.transformLength ?? entry.origLength;
		tables[entry.tag] = {
			buf: data.subarray(offset, offset + length),
			transformVersion: entry.transformVersion,
		};
		offset += length;
	}
	return tables;
}

interface ParsedFont {
	unitsPerEm: number;
	numGlyphs: number;
	/** Advance width in font units, indexed by glyph id. */
	advances: number[];
	/** Codepoint to glyph id. */
	cmap: Map<number, number>;
	gpos: Buffer | null;
	gsub: Buffer | null;
}

/**
 * A table the font must carry.
 * @param tables The font's tables.
 * @param tag The table wanted.
 * @param path The font file, for the error.
 * @returns The table.
 * @throws {Error} When the font lacks it.
 */
function requireTable(tables: Record<string, FontTable>, tag: string, path: string): FontTable {
	const table = tables[tag];
	if (!table) {
		throw new Error(`${path} carries no ${tag} table`);
	}
	return table;
}

/**
 * Advance widths from `hmtx`. It comes transformed (version 1) or not; either
 * way the advances come first, as `numberOfHMetrics` uint16s, and the
 * transform only drops the left-side-bearing arrays, which measuring does not
 * read. A monospaced tail past `numberOfHMetrics` repeats the last advance.
 * @param hmtx The table.
 * @param numberOfHMetrics How many advances the table carries.
 * @param numGlyphs How many glyphs the font has.
 * @returns Advances by glyph id.
 */
function readAdvances(hmtx: FontTable, numberOfHMetrics: number, numGlyphs: number): number[] {
	const hm = new Reader(hmtx.buf);
	const transformed = hmtx.transformVersion !== 0;
	if (transformed) {
		hm.u8();
	}
	const advances = Array.from<number>({ length: numGlyphs });
	let last = 0;
	for (let i = 0; i < numberOfHMetrics && i < numGlyphs; i++) {
		last = hm.u16();
		if (!transformed) {
			hm.i16(); // an untransformed longHorMetric carries lsb too
		}
		advances[i] = last;
	}
	for (let i = numberOfHMetrics; i < numGlyphs; i++) {
		advances[i] = last;
	}
	return advances;
}

/**
 * One font file, reduced to what measuring a string needs.
 * @param path The woff2 file.
 * @returns The parsed font.
 * @throws {Error} When a required table is missing.
 */
function parseFont(path: string): ParsedFont {
	const tables = readWoff2(path);
	const head = new Reader(requireTable(tables, "head", path).buf, 18);
	const unitsPerEm = head.u16();
	const maxp = new Reader(requireTable(tables, "maxp", path).buf, 4);
	const numGlyphs = maxp.u16();
	const hhea = new Reader(requireTable(tables, "hhea", path).buf, 34);
	const numberOfHMetrics = hhea.u16();
	const advances = readAdvances(requireTable(tables, "hmtx", path), numberOfHMetrics, numGlyphs);
	const cmap = parseCmap(requireTable(tables, "cmap", path).buf);
	return {
		unitsPerEm,
		numGlyphs,
		advances,
		cmap,
		gpos: tables["GPOS"]?.buf ?? null,
		gsub: tables["GSUB"]?.buf ?? null,
	};
}

/**
 * How much a cmap subtable's encoding is preferred: Unicode full range, then
 * Unicode BMP, then the Unicode platform, then anything else.
 * @param platformId The subtable's platform.
 * @param encodingId The subtable's encoding.
 * @returns A higher score for a better subtable.
 */
function subtableScore(platformId: number, encodingId: number): number {
	if (platformId === 3) {
		return encodingId === 10 ? 4 : encodingId === 1 ? 3 : 1;
	}
	return platformId === 0 ? 2 : 1;
}

/**
 * The offset of the best subtable the cmap offers.
 * @param r A reader at the start of the table.
 * @returns The subtable's offset.
 * @throws {Error} When the table has no subtable.
 */
function bestSubtableOffset(r: Reader): number {
	r.u16();
	const numTables = r.u16();
	let best: { score: number; offset: number } | null = null;
	for (let i = 0; i < numTables; i++) {
		const platformId = r.u16();
		const encodingId = r.u16();
		const offset = r.u32();
		const score = subtableScore(platformId, encodingId);
		if (!best || score > best.score) {
			best = { score, offset };
		}
	}
	if (!best) {
		throw new Error("cmap carries no subtable");
	}
	return best.offset;
}

/** One segment of a format 4 subtable. */
interface Segment {
	start: number;
	end: number;
	delta: number;
	rangeOffset: number;
	/** The offset of this segment's idRangeOffset entry, which glyph ids are relative to. */
	rangeAt: number;
}

/**
 * The glyph a format 4 segment maps one codepoint to.
 * @param buf The whole cmap table.
 * @param segment The segment.
 * @param c The codepoint.
 * @returns The glyph id, or 0 for none (or an id past the table).
 */
function format4Glyph(buf: Buffer, segment: Segment, c: number): number {
	if (segment.rangeOffset === 0) {
		return (c + segment.delta) & 0xffff;
	}
	const at = segment.rangeAt + segment.rangeOffset + (c - segment.start) * 2;
	if (at + 1 >= buf.length) {
		return 0;
	}
	const g = buf.readUInt16BE(at);
	return g === 0 ? 0 : (g + segment.delta) & 0xffff;
}

/**
 * Read a format 4 subtable into the map.
 * @param sub A reader positioned after the format field.
 * @param buf The whole cmap table.
 * @param map The map to fill.
 */
function readFormat4(sub: Reader, buf: Buffer, map: Map<number, number>): void {
	for (const segment of readSegments(sub)) {
		for (let c = segment.start; c <= segment.end && c !== 0xffff; c++) {
			const g = format4Glyph(buf, segment, c);
			if (g) {
				map.set(c, g);
			}
		}
	}
}

/**
 * The segments of a format 4 subtable, read out of its four parallel arrays.
 * @param sub A reader positioned after the format field.
 * @returns The segments in table order.
 */
function readSegments(sub: Reader): Segment[] {
	sub.u16();
	sub.u16(); // length, language
	const segCount = sub.u16() / 2;
	sub.u16();
	sub.u16();
	sub.u16(); // searchRange, entrySelector, rangeShift
	const endCodes = sub.u16s(segCount);
	sub.u16(); // reservedPad
	const startCodes = sub.u16s(segCount);
	const idDeltas = sub.u16s(segCount).map((v) => (v >= 0x8000 ? v - 0x10000 : v));
	const idRangeAt = sub.p;
	const idRangeOffsets = sub.u16s(segCount);
	return endCodes.map((end, s) => ({
		start: startCodes[s] ?? 0,
		end,
		delta: idDeltas[s] ?? 0,
		rangeOffset: idRangeOffsets[s] ?? 0,
		rangeAt: idRangeAt + s * 2,
	}));
}

/**
 * Read a format 12 subtable into the map.
 * @param sub A reader positioned after the format field.
 * @param map The map to fill.
 */
function readFormat12(sub: Reader, map: Map<number, number>): void {
	sub.u16();
	sub.u32();
	sub.u32(); // reserved, length, language
	const nGroups = sub.u32();
	for (let i = 0; i < nGroups; i++) {
		const start = sub.u32();
		const end = sub.u32();
		const startGid = sub.u32();
		for (let c = start; c <= end; c++) {
			map.set(c, startGid + (c - start));
		}
	}
}

/**
 * Codepoint to glyph id, from the best subtable the file offers.
 *
 * Formats 4 and 12 are the only two that appear in the shipped subsets, and a
 * third would be a silent wrong answer rather than a missing one, so an
 * unknown format throws.
 * @param buf The cmap table.
 * @returns Codepoint to glyph id.
 * @throws {Error} When the subtable's format is not 4 or 12.
 */
function parseCmap(buf: Buffer): Map<number, number> {
	const map = new Map<number, number>();
	const sub = new Reader(buf, bestSubtableOffset(new Reader(buf)));
	const format = sub.u16();
	if (format === 4) {
		readFormat4(sub, buf, map);
		return map;
	}
	if (format === 12) {
		readFormat12(sub, map);
		return map;
	}
	throw new Error(`cmap format ${format} is not one this reader knows`);
}

export { Reader, type FontTable, readWoff2, type ParsedFont, parseFont };
