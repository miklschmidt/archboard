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
import {
	layoutWithLines,
	measureLineStats,
	measureNaturalWidth,
	prepareWithSegments,
} from "@chenglou/pretext";
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
/**
 * A region's caption: the group's name, set larger than a card's title so a
 * reader finds the regions first and can still read them at overview scale.
 */
const CAPTION: TextStyle = { font: CARD_TITLE_FONT, fontSize: 20, lineHeight: 26, role: "label" };
/** Room around a region caption's words. */
const CAPTION_PADDING = { x: 12, y: 8 };

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
	// A wrapped line keeps the space it broke at; the painter draws none of it.
	return layoutWithLines(prepared, width, style.lineHeight).lines.map((line, index) => ({
		text: line.text.trimEnd(),
		width: exactWidth(line.text.trimEnd(), style),
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

/** The widest a relationship's plate grows before its words wrap. */
const LABEL_MAX_WIDTH = 200;
/** The narrowest plate, so a one-glyph label still reads as a plate. */
const LABEL_MIN_WIDTH = 40;

/**
 * The narrowest wrap width that keeps the line count the widest wrap gives,
 * so wrapped words share their lines evenly instead of leaving one word alone
 * on the last.
 * @param prepared The measured text.
 * @param limit The widest the lines may be.
 * @returns A width at most `limit` that breaks into no more lines than `limit` does.
 */
function balancedWrapWidth(
	prepared: ReturnType<typeof prepareWithSegments>,
	limit: number,
): number {
	const lines = measureLineStats(prepared, limit).lineCount;
	if (lines <= 1) {
		return limit;
	}
	let tooNarrow = measureNaturalWidth(prepared) / lines;
	let fits = limit;
	while (fits - tooNarrow > 0.5) {
		const middle = (tooNarrow + fits) / 2;
		if (measureLineStats(prepared, middle).lineCount <= lines) {
			fits = middle;
		} else {
			tooNarrow = middle;
		}
	}
	return fits;
}

/**
 * Settle a relationship's complete words and padded plate before routing it.
 * The words wrap balanced, the plate hugs the widest line, and every line is
 * centred, so the text sits on the line the plate is centred on.
 * @param text The connection label.
 * @returns Its box and the relative positions of its lines.
 */
function measureLabel(text: string): MeasuredLabel {
	const prepared = prepare(text, LABEL);
	const limit = LABEL_MAX_WIDTH - 2 * ARCHITECTURE_LABEL_PADDING_X;
	// A hanging space is not painted, so it neither widens nor off-centres the plate.
	const lines = layoutWithLines(prepared, balancedWrapWidth(prepared, limit), LABEL.lineHeight)
		.lines.map(({ text: line }) => line.trimEnd())
		.map((line) => ({ text: line, width: exactWidth(line, LABEL) }));
	const widest = lines.reduce((most, line) => Math.max(most, line.width), 0);
	const width = Math.max(LABEL_MIN_WIDTH, widest + 2 * ARCHITECTURE_LABEL_PADDING_X);
	return {
		width,
		height: Math.max(1, lines.length) * LABEL.lineHeight + 2 * ARCHITECTURE_LABEL_PADDING_Y,
		runs: lines.map((line, index) => ({
			...line,
			x: (width - line.width) / 2,
			y: ARCHITECTURE_LABEL_PADDING_Y + LABEL.fontSize + index * LABEL.lineHeight,
			font: LABEL.font,
			fontSize: LABEL.fontSize,
			role: LABEL.role,
		})),
	};
}

/**
 * Wrap a sequence message's words, balanced, so no line runs wider than the
 * room between the lifelines it is drawn between.
 * @param text The message's words.
 * @param width The widest a line may be.
 * @param fontSize The size the words are set at.
 * @param lineHeight The room each line takes.
 * @returns Every line, complete, with its painted width.
 */
function measureMessageLines(
	text: string,
	width: number,
	fontSize: number,
	lineHeight: number,
): { readonly text: string; readonly width: number }[] {
	const style = { ...LABEL, fontSize, lineHeight };
	const prepared = prepare(text, style);
	return layoutWithLines(prepared, balancedWrapWidth(prepared, width), lineHeight)
		.lines.map(({ text: line }) => line.trimEnd())
		.map((line) => ({ text: line, width: exactWidth(line, style) }));
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

export { measureArchitecture, measureMessageLines, measureNoteLines };
