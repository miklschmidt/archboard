// Reading a rendered document back the way a browser would.
//
// The point of this file is that it takes the SVG at its word. It resolves a
// piece of text's face from the `@font-face` rules the *document itself*
// registers, not from anything the renderer told it, so a document that names
// a family it does not register, or measures at one weight and draws at
// another, fails here rather than in somebody's browser.

import path from "node:path";
import { measureLineIn } from "@/runtime/engine/measure-text";
import type { DiagramBox } from "@/shared/semantic-board/index";
import { bodyShift } from "@/runtime/semantic-renderer/tests/drawn-routes";

/** Where the diagram faces live, from this file. */
const FONT_DIR = path.join(import.meta.dir, "../../../ui/shell/assets/fonts");

/** One `<text>` element, as it was written into the document. */
interface DrawnText {
	/** The semantic subject whose group it sits in. */
	readonly subject: { readonly kind: string; readonly id: string };
	/** Its `x`. */
	readonly x: number;
	/** Its baseline `y`, in drawing coordinates. */
	readonly y: number;
	/** Its `font-size`. */
	readonly size: number;
	/** The first family its `font-family` names, unquoted. */
	readonly family: string;
	/** Its `font-weight`. */
	readonly weight: number;
	/** Its `letter-spacing`, in ems. */
	readonly tracking: number;
	/** Whether it is centred on `x`. */
	readonly centred: boolean;
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

/**
 * Every face the document registers, by family and weight, resolved to the file
 * on disk it names. Only a linked document names files; an embedded one carries
 * the bytes, and nothing here needs to decode them.
 * @param svg The document.
 * @returns Each `family|weight` key's font file path.
 */
function registeredFaces(svg: string): Map<string, string> {
	const faces = new Map<string, string>();
	const rules = svg.matchAll(
		/@font-face\{font-family:"([^"]+)";font-style:normal;font-weight:(\d+);src:url\("([^"]*)"\)/g,
	);
	for (const [, family, weight, source] of rules) {
		if (source === undefined || source.startsWith("data:")) {
			continue;
		}
		faces.set(`${family}|${weight}`, path.join(FONT_DIR, source.split("/").pop() ?? ""));
	}
	return faces;
}

/**
 * The first family a `font-family` stack names.
 * @param stack The stack.
 * @returns The family, unquoted.
 */
function firstFamily(stack: string): string {
	const quoted = /^"([^"]+)"/.exec(stack);
	return quoted === null ? (stack.split(",")[0] ?? "").trim() : (quoted[1] ?? "");
}

/**
 * The `<text>` elements of one subject group.
 * @param chunk The group's markup.
 * @param subject Which subject it draws.
 * @param shift How far the document moved its whole body onto the page.
 * @returns Its text elements, in page coordinates.
 */
function textsIn(
	chunk: string,
	subject: { kind: string; id: string },
	shift: ReturnType<typeof bodyShift>,
): DrawnText[] {
	const drawn: DrawnText[] = [];
	for (const [, tag, body] of chunk.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)) {
		const spacing = attr(tag ?? "", "letter-spacing");
		drawn.push({
			subject,
			x: Number(attr(tag ?? "", "x")) + shift.x,
			y: Number(attr(tag ?? "", "y")) + shift.y,
			size: Number(attr(tag ?? "", "font-size")),
			family: firstFamily(attr(tag ?? "", "font-family") ?? ""),
			weight: Number(attr(tag ?? "", "font-weight")),
			tracking: spacing === undefined ? 0 : Number(spacing.replace("em", "")),
			centred: attr(tag ?? "", "text-anchor") === "middle",
			text: unescape(body ?? ""),
		});
	}
	return drawn;
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
 * @returns The text elements, in document order.
 */
function drawnTexts(svg: string): DrawnText[] {
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
		drawn.push(...textsIn(chunk, { kind, id }, shift));
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
 * @param kind Which sort of subject to read: `edge` in the architecture grammar, `step` in the data-flow one.
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
 * How wide one drawn text really is, measured in the face the document says it
 * is drawn in.
 * @param drawn The text element.
 * @param faces The faces the document registers.
 * @returns Its width in diagram units.
 * @throws {Error} When the document draws in a face it never registered.
 */
function drawnWidth(drawn: DrawnText, faces: ReadonlyMap<string, string>): number {
	const file = faces.get(`${drawn.family}|${drawn.weight}`);
	if (file === undefined) {
		throw new Error(
			`"${drawn.text}" is drawn in ${drawn.family} ${drawn.weight}, which the document does not register`,
		);
	}
	const measured = measureLineIn(drawn.text, drawn.size, [[{ file, ranges: null }]]);
	return measured.width + Array.from(drawn.text).length * drawn.tracking * drawn.size;
}

/**
 * The horizontal run one drawn text occupies.
 * @param drawn The text element.
 * @param faces The faces the document registers.
 * @returns Its left and right edges.
 * @throws {Error} When the document draws in a face it never registered.
 */
function drawnSpan(
	drawn: DrawnText,
	faces: ReadonlyMap<string, string>,
): { left: number; right: number } {
	const width = drawnWidth(drawn, faces);
	const left = drawn.centred ? drawn.x - width / 2 : drawn.x;
	return { left, right: left + width };
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

export {
	type DrawnText,
	FONT_DIR,
	registeredFaces,
	labelPlates,
	drawnTexts,
	drawnWidth,
	drawnSpan,
	spanFits,
};
