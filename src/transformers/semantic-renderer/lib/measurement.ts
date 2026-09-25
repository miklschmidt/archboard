import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_HEADER_PADDING,
	ARCHITECTURE_ICON_GAP,
	ARCHITECTURE_NOTE_GAP,
	ARCHITECTURE_LABEL_PADDING_X,
	ARCHITECTURE_LABEL_PADDING_Y,
} from "@/transformers/semantic-renderer/config";
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
// The words settle before placement. Pretext owns line breaking; the canvas of
// the place drawing the picture measures the strings the SVG will paint.
import { layoutWithLines, measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";
import {
	placingGroups,
	type SemanticNode,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import { canvasWidth, cssFont } from "@/transformers/semantic-renderer/lib/canvas-text";
import type {
	MeasuredArchitecture,
	MeasuredLabel,
	MeasuredNode,
	TextRun,
} from "@/transformers/semantic-renderer/lib/drawing";
import {
	CARD_NOTE_FONT,
	CARD_TITLE_FONT,
	PILL_FONT,
} from "@/transformers/semantic-renderer/lib/fonts";

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
const CAPTION: TextStyle = { font: CARD_TITLE_FONT, fontSize: 12, lineHeight: 16, role: "label" };
/** Room around a region caption's words. */
const CAPTION_PADDING = { x: 10, y: 6 };

/**
 * Measure a whole painted line, preserving kerning across Pretext segments.
 * @param text The string that will be painted.
 * @param style Its exact face and size.
 * @returns The unrounded width of the string.
 */
function exactWidth(text: string, style: TextStyle): number {
	return canvasWidth(text, style.font, style.fontSize);
}

/**
 * Prepare words against the same font that their SVG runs carry. Pretext
 * measures its segments with the host's canvas, as `exactWidth` does.
 * @param text The complete authored text.
 * @param style The renderer's fixed typography role.
 * @returns Pretext's reusable preparation result.
 */
function prepare(text: string, style: TextStyle): ReturnType<typeof prepareWithSegments> {
	return prepareWithSegments(text, cssFont(style.font, style.fontSize), { whiteSpace: "pre-wrap" });
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
 * Wrap a sequence responsibility with the same measured line breaking as architecture cards.
 * @param text The complete authored note.
 * @param width The available text width.
 * @param fontSize The sequence note size.
 * @param lineHeight The room reserved for each line.
 * @returns Measured lines relative to the top-left of the note block.
 */
function measureNoteLines(
	text: string,
	width: number,
	fontSize: number,
	lineHeight: number,
): TextRun[] {
	const style = { ...NOTE, fontSize, lineHeight };
	return runsFor(prepare(text, style), style, width, 0, 0);
}

/**
 * Reserve all title and responsibility lines before a card gains neighbours.
 * @param node The semantic subject, including its complete authored words.
 * @param container Whether other subjects name this one as their parent.
 * @returns Its minimum box and all relative text positions.
 */
function measureNode(node: SemanticNode, container: boolean): MeasuredNode {
	const padding = container ? ARCHITECTURE_HEADER_PADDING : ARCHITECTURE_CARD_PADDING;
	const left = padding + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
	const title = prepare(node.name, TITLE);
	const note = prepare(node.responsibility ?? "", NOTE);
	const natural = Math.max(measureNaturalWidth(title), measureNaturalWidth(note));
	const width = Math.min(340, Math.max(260, natural + left + padding));
	const available = width - left - padding;
	const titles = runsFor(title, TITLE, available, left, padding);
	const noteTop = padding + titles.length * TITLE.lineHeight + ARCHITECTURE_NOTE_GAP;
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
	const width = Math.min(
		200,
		Math.max(40, measureNaturalWidth(prepared) + 2 * ARCHITECTURE_LABEL_PADDING_X),
	);
	const runs = runsFor(
		prepared,
		LABEL,
		width - 2 * ARCHITECTURE_LABEL_PADDING_X,
		ARCHITECTURE_LABEL_PADDING_X,
		ARCHITECTURE_LABEL_PADDING_Y,
	);
	const paintedWidth = runs.reduce((widest, run) => Math.max(widest, run.width), 0);
	return {
		width: Math.max(width, paintedWidth + 2 * ARCHITECTURE_LABEL_PADDING_X),
		height: Math.max(1, runs.length) * LABEL.lineHeight + 2 * ARCHITECTURE_LABEL_PADDING_Y,
		runs,
	};
}

/**
 * Measure a group's name as the caption its region is drawn with: one line.
 * @param name The group's name.
 * @returns Its box and its line.
 */
function measureCaption(name: string): MeasuredLabel {
	const width = exactWidth(name, CAPTION);
	return {
		width: width + 2 * CAPTION_PADDING.x,
		height: CAPTION.lineHeight + 2 * CAPTION_PADDING.y,
		runs: [
			{
				text: name,
				width,
				x: CAPTION_PADDING.x,
				y: CAPTION_PADDING.y + CAPTION.fontSize,
				font: CAPTION.font,
				fontSize: CAPTION.fontSize,
				role: CAPTION.role,
			},
		],
	};
}

/**
 * Measure every architectural subject before placement or SVG emission.
 * @param content The already validated semantic content.
 * @param policy The vault's groups, in order, when groups gather and colour cards.
 * @returns Text, card minima, container headers, relationship labels and group captions.
 */
function measureArchitecture(
	content: VariantContent,
	policy: Pick<SemanticPolicy, "groups"> = { groups: {} },
): MeasuredArchitecture {
	const containers = new Set(content.nodes.flatMap((node) => (node.parent ? [node.parent] : [])));
	const placing = placingGroups(content.nodes, policy);
	return {
		nodes: new Map(
			content.nodes.map((node) => [node.id, measureNode(node, containers.has(node.id))]),
		),
		labels: new Map(
			content.edges.flatMap((edge) => (edge.label ? [[edge.id, measureLabel(edge.label)]] : [])),
		),
		...(placing.size === 0
			? {}
			: {
					groups: {
						placing,
						captions: new Map(
							[...new Set(placing.values())].map((id) => [
								id,
								measureCaption(policy.groups[id]!.name),
							]),
						),
					},
				}),
	};
}

export { measureArchitecture, measureNoteLines };
