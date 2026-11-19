// One line of the code view as runs of text and marked names (TASK-648). The colours come from the
// highlighter as runs that know nothing of the model, and a marked name can start or end inside a
// run, so the runs are cut at each name's edges and each name gathers the pieces it covers.

import type { CSSProperties } from "react";
import type { CodeToken } from "#ui/architecture-drawing/code-highlighting/clients/code-highlighter.ts";
import type { NameMark } from "#ui/architecture-drawing/code-browser/rules/symbol-marks.ts";

/** A piece of a line in one colour, by where it starts in the line. */
interface Piece {
	readonly at: number;
	readonly content: string;
	/** Its colour, or nothing for the plain colour. */
	readonly style: CSSProperties | undefined;
}

/** A run of a line: plain text, or a marked name and the pieces it covers. */
type Segment =
	| { readonly kind: "text"; readonly at: number; readonly pieces: readonly Piece[] }
	| {
			readonly kind: "mark";
			readonly at: number;
			readonly mark: NameMark;
			readonly pieces: readonly Piece[];
	  };

/**
 * The pieces of a line, in its colours once they are worked out, or plain until then.
 * @param text The line.
 * @param tokens Its colours, or undefined while they are worked out.
 * @returns The pieces.
 */
function piecesOf(text: string, tokens: readonly CodeToken[] | undefined): readonly Piece[] {
	if (tokens === undefined) return [{ at: 0, content: text, style: undefined }];
	let at = 0;
	return tokens.map(({ content, color }) => {
		const piece = { at, content, style: color === undefined ? undefined : { color } };
		at += content.length;
		return piece;
	});
}

/**
 * The pieces that fall between two characters of a line, cut at its edges.
 * @param pieces The pieces of the line.
 * @param start The first character.
 * @param end One past the last.
 * @returns The pieces, cut to the stretch.
 */
function cut(pieces: readonly Piece[], start: number, end: number): readonly Piece[] {
	return pieces.flatMap((piece) => {
		const from = Math.max(start, piece.at);
		const to = Math.min(end, piece.at + piece.content.length);
		if (from >= to) return [];
		const content = piece.content.slice(from - piece.at, to - piece.at);
		return [{ at: from, style: piece.style, content }];
	});
}

/**
 * A line as runs of plain text and marked names.
 * @param text The line.
 * @param tokens Its colours, or undefined while they are worked out.
 * @param marks The names marked on it, in order, apart from each other.
 * @returns The runs, in order.
 */
function lineSegments(
	text: string,
	tokens: readonly CodeToken[] | undefined,
	marks: readonly NameMark[],
): readonly Segment[] {
	const pieces = piecesOf(text, tokens);
	const segments: Segment[] = [];
	let at = 0;
	for (const mark of marks) {
		if (mark.start < at) continue;
		if (mark.start > at) segments.push({ kind: "text", at, pieces: cut(pieces, at, mark.start) });
		segments.push({
			kind: "mark",
			at: mark.start,
			mark,
			pieces: cut(pieces, mark.start, mark.end),
		});
		at = mark.end;
	}
	if (at < text.length) segments.push({ kind: "text", at, pieces: cut(pieces, at, text.length) });
	return segments;
}

export { lineSegments, type Piece, type Segment };
