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
export class Reader {
	readonly b: Buffer;
	p: number;

	constructor(buf: Buffer, pos = 0) {
		this.b = buf;
		this.p = pos;
	}

	u8(): number {
		return this.b[this.p++] as number;
	}
	u16(): number {
		const v = this.b.readUInt16BE(this.p);
		this.p += 2;
		return v;
	}
	i16(): number {
		const v = this.b.readInt16BE(this.p);
		this.p += 2;
		return v;
	}
	u32(): number {
		const v = this.b.readUInt32BE(this.p);
		this.p += 4;
		return v;
	}
	tag(): string {
		const v = this.b.toString("ascii", this.p, this.p + 4);
		this.p += 4;
		return v;
	}

	/** woff2's variable-length unsigned integer. */
	base128(): number {
		let v = 0;
		for (let i = 0; i < 5; i++) {
			const byte = this.u8();
			v = (v << 7) | (byte & 0x7f);
			if ((byte & 0x80) === 0) return v >>> 0;
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

export interface FontTable {
	buf: Buffer;
	transformVersion: number;
}

/** The tables of one woff2 file, decompressed and cut apart. */
export function readWoff2(path: string): Record<string, FontTable> {
	const buf = readFileSync(path);
	if (buf.length < 48 || buf.toString("ascii", 0, 4) !== "wOF2") {
		throw new Error(`${path} is not a woff2 file`);
	}
	const r = new Reader(buf, 4);
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

	const directory: DirectoryEntry[] = [];
	for (let i = 0; i < numTables; i++) {
		const flags = r.u8();
		const tagIndex = flags & 0x3f;
		const transformVersion = (flags >> 6) & 0x03;
		const tag =
			tagIndex === 63 ? buf.toString("ascii", r.p, (r.p += 4)) : (KNOWN_TAGS[tagIndex] as string);
		const origLength = r.base128();
		// `glyf` and `loca` are transformed unless the version says otherwise;
		// every other table is the other way round.
		const nullTransform =
			tag === "glyf" || tag === "loca" ? transformVersion === 3 : transformVersion === 0;
		const transformLength = nullTransform ? null : r.base128();
		directory.push({ tag, transformVersion, origLength, transformLength });
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

export interface ParsedFont {
	unitsPerEm: number;
	numGlyphs: number;
	/** Advance width in font units, indexed by glyph id. */
	advances: number[];
	/** Codepoint to glyph id. */
	cmap: Map<number, number>;
	gpos: Buffer | null;
	gsub: Buffer | null;
}

/** One font file, reduced to what measuring a string needs. */
export function parseFont(path: string): ParsedFont {
	const tables = readWoff2(path);
	for (const required of ["head", "maxp", "hhea", "hmtx", "cmap"]) {
		if (!tables[required]) throw new Error(`${path} carries no ${required} table`);
	}

	const head = new Reader((tables.head as FontTable).buf, 18);
	const unitsPerEm = head.u16();

	const maxp = new Reader((tables.maxp as FontTable).buf, 4);
	const numGlyphs = maxp.u16();

	const hhea = new Reader((tables.hhea as FontTable).buf, 34);
	const numberOfHMetrics = hhea.u16();

	// hmtx comes transformed (version 1) or not. Either way the advance widths
	// come first, as `numberOfHMetrics` uint16s; the transform only drops the
	// left-side-bearing arrays, which measuring does not read.
	const hmtx = tables.hmtx as FontTable;
	const hm = new Reader(hmtx.buf);
	const transformed = hmtx.transformVersion !== 0;
	if (transformed) hm.u8();
	const advances = new Array<number>(numGlyphs);
	let last = 0;
	for (let i = 0; i < numberOfHMetrics && i < numGlyphs; i++) {
		last = hm.u16();
		if (!transformed) hm.i16(); // an untransformed longHorMetric carries lsb too
		advances[i] = last;
	}
	// A monospaced tail: everything past numberOfHMetrics repeats the last advance.
	for (let i = numberOfHMetrics; i < numGlyphs; i++) advances[i] = last;

	return {
		unitsPerEm,
		numGlyphs,
		advances,
		cmap: parseCmap((tables.cmap as FontTable).buf),
		gpos: tables.GPOS ? tables.GPOS.buf : null,
		gsub: tables.GSUB ? tables.GSUB.buf : null,
	};
}

/**
 * Codepoint to glyph id, from the best subtable the file offers.
 *
 * Formats 4 and 12 are the only two that appear in the shipped subsets, and a
 * third would be a silent wrong answer rather than a missing one, so an
 * unknown format throws.
 */
function parseCmap(buf: Buffer): Map<number, number> {
	const r = new Reader(buf);
	r.u16();
	const numTables = r.u16();
	let best: { score: number; offset: number } | null = null;
	for (let i = 0; i < numTables; i++) {
		const platformId = r.u16();
		const encodingId = r.u16();
		const offset = r.u32();
		const score =
			platformId === 3 && encodingId === 10
				? 4
				: platformId === 3 && encodingId === 1
					? 3
					: platformId === 0
						? 2
						: 1;
		if (!best || score > best.score) best = { score, offset };
	}
	if (!best) throw new Error("cmap carries no subtable");

	const map = new Map<number, number>();
	const sub = new Reader(buf, best.offset);
	const format = sub.u16();

	if (format === 4) {
		sub.u16();
		sub.u16(); // length, language
		const segCount = sub.u16() / 2;
		sub.u16();
		sub.u16();
		sub.u16(); // searchRange, entrySelector, rangeShift
		const endCodes: number[] = [];
		for (let i = 0; i < segCount; i++) endCodes.push(sub.u16());
		sub.u16(); // reservedPad
		const startCodes: number[] = [];
		for (let i = 0; i < segCount; i++) startCodes.push(sub.u16());
		const idDeltas: number[] = [];
		for (let i = 0; i < segCount; i++) idDeltas.push(sub.i16());
		const idRangeAt = sub.p;
		const idRangeOffsets: number[] = [];
		for (let i = 0; i < segCount; i++) idRangeOffsets.push(sub.u16());
		for (let s = 0; s < segCount; s++) {
			const end = endCodes[s] as number;
			const start = startCodes[s] as number;
			const delta = idDeltas[s] as number;
			const rangeOffset = idRangeOffsets[s] as number;
			for (let c = start; c <= end && c !== 0xffff; c++) {
				let g: number;
				if (rangeOffset === 0) g = (c + delta) & 0xffff;
				else {
					const at = idRangeAt + s * 2 + rangeOffset + (c - start) * 2;
					if (at + 1 >= buf.length) continue;
					g = buf.readUInt16BE(at);
					if (g !== 0) g = (g + delta) & 0xffff;
				}
				if (g) map.set(c, g);
			}
		}
		return map;
	}

	if (format === 12) {
		sub.u16();
		sub.u32();
		sub.u32(); // reserved, length, language
		const nGroups = sub.u32();
		for (let i = 0; i < nGroups; i++) {
			const start = sub.u32();
			const end = sub.u32();
			const startGid = sub.u32();
			for (let c = start; c <= end; c++) map.set(c, startGid + (c - start));
		}
		return map;
	}

	throw new Error(`cmap format ${format} is not one this reader knows`);
}
