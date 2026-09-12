// A font file, parsed once, with the layout tables measurement needs.
//
// A face is addressed the way CSS addresses one: a file, and the range of
// characters it declares it covers. Which file a character is drawn from
// follows the `@font-face` `unicode-range` descriptor rather than which file
// happens to carry the glyph, because that is what CSS says and what Blink
// does (`docs/design/measuring-text-outside-a-browser.md`).
//
// There is no font registry here and no family numbers. The faces this
// repository draws in are named by the renderer that draws them
// (`src/runtime/semantic-renderer/lib/fonts.ts`), which knows which file each
// family and weight is, and hands the stack to `measureLineIn`. One measuring
// engine, one owner of which files exist, and no third party in between.

import { parseFont, type ParsedFont } from "@/runtime/engine/font-file";
import {
	buildGpos,
	buildGsub,
	type Kerning,
	type Substitutions,
} from "@/runtime/engine/font-layout";

/** One face of one family: a file, and what it declares it covers. */
interface FaceDescriptor {
	/** Absolute path to the font file. */
	file: string;
	/** The `unicode-range` descriptor, parsed. `null` means the whole of unicode. */
	ranges: Array<[number, number]> | null;
}

/** A parsed face and its layout tables. */
interface LoadedFace {
	font: ParsedFont;
	gpos: Kerning | null;
	gsub: Substitutions | null;
}

const faceCache = new Map<string, LoadedFace>();

/**
 * One font file, parsed once per process.
 *
 * Lazy per file rather than per family, because a family's faces are chosen by
 * `unicode-range` and most strings touch one of them: a family that ships two
 * hundred subsets costs only the subsets a diagram's text actually reaches.
 * @param file The font file's path.
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

export { type FaceDescriptor, type LoadedFace, loadFace };
