// The words settle before placement. Pretext owns line breaking; the bundled
// font engine measures the actual strings the SVG will paint.
import {
	layoutWithLines,
	measureNaturalWidth,
	prepareWithSegments,
	setMeasureFunction,
} from "@chenglou/pretext";
import type { SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import { measureLineIn } from "@/runtime/engine/measure-text";
import type {
	MeasuredArchitecture,
	MeasuredLabel,
	MeasuredNode,
	TextRun,
} from "@/runtime/semantic-renderer/lib/drawing";
import {
	CARD_NOTE_FONT,
	CARD_TITLE_FONT,
	PILL_FONT,
	fontAttributes,
	stackFor,
} from "@/runtime/semantic-renderer/lib/fonts";

type TextStyle = Pick<TextRun, "font" | "fontSize" | "role"> & {
	readonly lineHeight: number;
};

const TITLE: TextStyle = {
	font: CARD_TITLE_FONT,
	fontSize: 14,
	lineHeight: 20,
	role: "title",
};
const NOTE: TextStyle = {
	font: CARD_NOTE_FONT,
	fontSize: 11,
	lineHeight: 17,
	role: "note",
};
const LABEL: TextStyle = { font: PILL_FONT, fontSize: 10, lineHeight: 15, role: "label" };

// Register exact CSS font strings once. No CSS parser or host font registry is
// needed: these three renderer styles are the only callers of preparation.
const styles = new Map<string, TextStyle>();
setMeasureFunction(measureSegment);

/**
 * Measure a Pretext segment in its registered renderer face.
 * @param text The segment being prepared.
 * @param font The canonical font string used as Pretext's cache key.
 * @returns Its width in drawing units.
 * @throws {Error} When preparation bypasses this module's font registration.
 */
function measureSegment(text: string, font: string): number {
	const style = styles.get(font);
	if (style === undefined) {
		throw new Error(`Cannot measure an unregistered diagram font: ${font}`);
	}
	return exactWidth(text, style);
}

/**
 * Measure a whole painted line, preserving kerning across Pretext segments.
 * @param text The string that will be painted.
 * @param style Its exact face and size.
 * @returns The unrounded width of the string.
 */
function exactWidth(text: string, style: TextStyle): number {
	return measureLineIn(text, style.fontSize, stackFor(style.font)).width;
}

/**
 * Prepare words against the same font that their SVG runs carry.
 * @param text The complete authored text.
 * @param style The renderer's fixed typography role.
 * @returns Pretext's reusable preparation result.
 */
function prepare(text: string, style: TextStyle): ReturnType<typeof prepareWithSegments> {
	const attributes = fontAttributes(style.font);
	const font = `${style.font.weight} ${style.fontSize}px ${attributes["font-family"]}`;
	styles.set(font, style);
	return prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
}

/**
 * Materialize wrapped lines with their exact painter baselines and widths.
 * @param prepared The measured text.
 * @param style Its typography role.
 * @param width The available horizontal space.
 * @param x The text's left inset.
 * @param top The top of its first line box.
 * @returns Runs ready for painting without another fitting decision.
 */
function runsFor(
	prepared: ReturnType<typeof prepareWithSegments>,
	style: TextStyle,
	width: number,
	x: number,
	top: number,
): TextRun[] {
	return layoutWithLines(prepared, width, style.lineHeight).lines.map((line, index) => ({
		text: line.text,
		width: exactWidth(line.text, style),
		x,
		y: top + style.fontSize + index * style.lineHeight,
		font: style.font,
		fontSize: style.fontSize,
		role: style.role,
	}));
}

/**
 * Reserve all title and responsibility lines before a card gains neighbours.
 * @param node The semantic subject, including its complete authored words.
 * @param container Whether other subjects name this one as their parent.
 * @returns Its minimum box and all relative text positions.
 */
function measureNode(node: SemanticNode, container: boolean): MeasuredNode {
	const padding = container ? 20 : 16;
	const left = container ? 56 : 52;
	const title = prepare(node.name, TITLE);
	const note = prepare(node.responsibility ?? "", NOTE);
	const natural = Math.max(measureNaturalWidth(title), measureNaturalWidth(note));
	const width = Math.min(340, Math.max(260, natural + left + padding));
	const available = width - left - padding;
	const titles = runsFor(title, TITLE, available, left, padding);
	const noteTop = padding + titles.length * TITLE.lineHeight + 10;
	const notes = runsFor(note, NOTE, available, left, noteTop);
	const runs = [...titles, ...notes];
	const bottom =
		notes.length > 0
			? noteTop + notes.length * NOTE.lineHeight
			: padding + titles.length * TITLE.lineHeight;
	const height = Math.max(72, bottom + padding);
	// Pretext's segment sums can differ from whole-line kerning. The actual
	// painted width wins, even when a single long identifier needs a little
	// more space than the preferred maximum; no character is hidden or cut.
	const paintedWidth = runs.reduce((widest, run) => Math.max(widest, run.width), 0);
	return {
		node,
		width: Math.max(width, left + paintedWidth + padding),
		height,
		headerHeight: container ? height : 0,
		runs,
	};
}

/**
 * Settle a relationship's complete words and padded plate before routing it.
 * @param text The connection label.
 * @returns Its box and the relative positions of its lines.
 */
function measureLabel(text: string): MeasuredLabel {
	const prepared = prepare(text, LABEL);
	const width = Math.min(200, Math.max(40, measureNaturalWidth(prepared) + 20));
	const runs = runsFor(prepared, LABEL, width - 20, 10, 8);
	const paintedWidth = runs.reduce((widest, run) => Math.max(widest, run.width), 0);
	return {
		width: Math.max(width, paintedWidth + 20),
		height: Math.max(1, runs.length) * LABEL.lineHeight + 16,
		runs,
	};
}

/**
 * Measure every architectural subject before placement or SVG emission.
 * @param content The already validated semantic content.
 * @returns Text, card minima, container headers and relationship labels.
 */
function measureArchitecture(content: VariantContent): MeasuredArchitecture {
	const containers = new Set(content.nodes.flatMap((node) => (node.parent ? [node.parent] : [])));
	return {
		nodes: new Map(
			content.nodes.map((node) => [node.id, measureNode(node, containers.has(node.id))]),
		),
		labels: new Map(
			content.edges.flatMap((edge) => (edge.label ? [[edge.id, measureLabel(edge.label)]] : [])),
		),
	};
}

export { measureArchitecture };
