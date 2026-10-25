// Reading a rendered document back the way a browser would.
//
// The point of this file is that it takes the SVG at its word. A run's face is
// the face its glyphs are drawn from, and its width is the advance its words
// are stretched over, both as the document writes them, not anything the
// renderer told the test (ADR 0057).

import type { DiagramBox } from "@archboard/board/render-reply";
import { bodyShift } from "#tests/runtime/support/drawn-routes.ts";

/** One run of words, as it was written into the document. */
interface DrawnText {
	/** The semantic subject whose group it sits in. */
	readonly subject: { readonly kind: string; readonly id: string };
	/** Its left edge: its `x`. */
	readonly x: number;
	/** Its baseline `y`, in drawing coordinates. */
	readonly y: number;
	/** Its `font-size`. */
	readonly size: number;
	/** The face its first glyph is drawn from, as the glyph ids name it: `s4`, `s5`, `m4` or `m5` for its own. */
	readonly face: string | undefined;
	/** The weight of that face. */
	readonly weight: number;
	/** How far its glyphs advance: the `textLength` its words are stretched over. */
	readonly width: number;
	/** What it says. */
	readonly text: string;
}

/**
 * Undo the escaping the document writes attribute values with.
 * @param value The attribute value.
 * @returns The value a parser would see.
 */
function unescape(value: string): string {
	return value
		.replaceAll("&quot;", '"')
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

/**
 * One attribute of a serialised tag.
 * @param tag The tag's attribute text.
 * @param name Which attribute.
 * @returns Its unescaped value, or undefined.
 */
function attr(tag: string, name: string): string | undefined {
	const found = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
	return found === null ? undefined : unescape(found[1] ?? "");
}

/** A run: the group of glyphs that draws it, when it draws any, then its words. */
const RUN =
	/(?:<g transform="[^"]*"[^>]*aria-hidden="true">((?:<use[^>]*\/>)*)<\/g>)?<text([^>]*)>([^<]*)<\/text>/g;

/**
 * The runs of one subject group.
 * @param chunk The group's markup.
 * @param subject Which subject it draws.
 * @param shift How far the document moved its whole body onto the page.
 * @returns Its runs, in page coordinates.
 */
function textsIn(
	chunk: string,
	subject: { kind: string; id: string },
	shift: ReturnType<typeof bodyShift>,
): DrawnText[] {
	const drawn: DrawnText[] = [];
	for (const [, glyphs, tag, body] of chunk.matchAll(RUN)) {
		const face = /href="#g([a-z][45])-/.exec(glyphs ?? "")?.[1];
		drawn.push({
			subject,
			x: Number(attr(tag ?? "", "x")) + shift.x,
			y: Number(attr(tag ?? "", "y")) + shift.y,
			size: Number(attr(tag ?? "", "font-size")),
			face,
			weight: face?.endsWith("5") === true ? 500 : 400,
			width: Number(attr(tag ?? "", "textLength") ?? 0),
			text: unescape(body ?? ""),
		});
	}
	return drawn;
}

/** The opening of a card's layer drawn only when the picture is seen from far away. */
const FAR_LAYER = '<g class="ab-far"';

/**
 * A group's markup as it is drawn near, or only what it draws from far away:
 * a card draws its far layer, from its opening tag to the one that closes it,
 * only while the picture is seen from far away.
 * @param chunk The group's markup.
 * @param seen From near or from far away.
 * @returns The markup drawn.
 */
function seenFrom(chunk: string, seen: "near" | "far"): string {
	let near = "";
	let far = "";
	let from = 0;
	for (let start = chunk.indexOf(FAR_LAYER); start !== -1; start = chunk.indexOf(FAR_LAYER, from)) {
		const tags = /<(\/?)g\b[^>]*?(\/?)>/gu;
		tags.lastIndex = start;
		let depth = 0;
		let end = chunk.length;
		for (let tag = tags.exec(chunk); tag !== null; tag = tags.exec(chunk)) {
			depth += tag[1] === "/" ? -1 : tag[2] === "/" ? 0 : 1;
			if (depth === 0) {
				end = tags.lastIndex;
				break;
			}
		}
		near += chunk.slice(from, start);
		far += chunk.slice(start, end);
		from = end;
	}
	return seen === "far" ? far : near + chunk.slice(from);
}

/**
 * Every piece of text the document draws, tagged with the subject it belongs
 * to.
 *
 * Subject groups are never nested inside one another, so splitting on the
 * opening tag is enough to say which subject any text sits under — which is
 * also the thing being checked, since a label drawn outside its edge's group
 * would come back under the wrong subject or none at all.
 * @param svg The document.
 * @param seen Whether the picture is seen near, as it is drawn unless a
 * viewer says otherwise, or from far away.
 * @returns The text elements, in document order.
 */
function drawnTexts(svg: string, seen: "near" | "far" = "near"): DrawnText[] {
	// In page coordinates, which is what the atlas is written in and what a
	// browser lays the text out at: the document moves its whole body onto the
	// page with one transform, and reading the `x` attribute without it would
	// compare two different frames of reference.
	const shift = bodyShift(svg);
	const chunks = svg.split(/(?=<g data-semantic-kind=)/);
	const drawn: DrawnText[] = [];
	for (const chunk of chunks) {
		const kind = attr(chunk.slice(0, 200), "data-semantic-kind");
		const id = attr(chunk.slice(0, 200), "data-semantic-id");
		if (kind === undefined || id === undefined) {
			continue;
		}
		drawn.push(...textsIn(seenFrom(chunk, seen), { kind, id }, shift));
	}
	return drawn;
}

/**
 * The plate behind each label, by the id of the subject carrying it.
 *
 * A relationship's group — an architecture edge, or a sequence step — draws two
 * paths and, when it has a label, one rect. Reading it back is how a label is
 * checked against the thing it actually has to fit, rather than against an atlas
 * box that was derived from it.
 * @param svg The document.
 * @param kind Which sort of subject to read: `edge` in the architecture grammar, `step` in the sequence one.
 * @returns Each labelled subject's plate.
 */
function labelPlates(svg: string, kind: string = "edge"): Map<string, DiagramBox> {
	const shift = bodyShift(svg);
	const plates = new Map<string, DiagramBox>();
	for (const chunk of svg.split(/(?=<g data-semantic-kind=)/)) {
		const head = chunk.slice(0, 200);
		if (attr(head, "data-semantic-kind") !== kind) {
			continue;
		}
		const id = attr(head, "data-semantic-id");
		const rect = /<rect([^>]*)\/>/.exec(chunk);
		if (id === undefined || rect === null) {
			continue;
		}
		plates.set(id, {
			x: Number(attr(rect[1] ?? "", "x")) + shift.x,
			y: Number(attr(rect[1] ?? "", "y")) + shift.y,
			width: Number(attr(rect[1] ?? "", "width")),
			height: Number(attr(rect[1] ?? "", "height")),
		});
	}
	return plates;
}

/**
 * The horizontal run one drawn text occupies: from its left edge as far as its
 * glyphs advance.
 * @param drawn The run.
 * @returns Its left and right edges.
 */
function drawnSpan(drawn: DrawnText): { left: number; right: number } {
	return { left: drawn.x, right: drawn.x + drawn.width };
}

/**
 * Whether a run of text fits inside a box, allowing a hair of rounding.
 * @param span The text's run.
 * @param box The box it should fit.
 * @returns True when it fits.
 */
function spanFits(span: { left: number; right: number }, box: DiagramBox): boolean {
	const slack = 0.01;
	return span.left >= box.x - slack && span.right <= box.x + box.width + slack;
}

export { type DrawnText, labelPlates, drawnTexts, drawnSpan, spanFits };
