import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_HEADER_PADDING,
	ARCHITECTURE_ICON_GAP,
	ARCHITECTURE_NOTE_GAP,
	ARCHITECTURE_LABEL_PADDING_X,
	ARCHITECTURE_LABEL_PADDING_Y,
} from "@/transformers/semantic-renderer/config";
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { DRILL_MARK_ROOM } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
// The words settle before placement. Pretext owns line breaking; the canvas of
// the place drawing the picture measures the strings the SVG will paint.
import {
	layoutWithLines,
	measureLineStats,
	measureNaturalWidth,
	prepareWithSegments,
	walkLineRanges,
} from "@chenglou/pretext";
import {
	gatheringGroups,
	type SemanticNode,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
import { canvasWidth, cssFont } from "@/transformers/semantic-renderer/lib/canvas-text";
import { lineLooks } from "@/transformers/semantic-renderer/lib/semantic-appearance";
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
	// A part that opens another board keeps its name clear of the mark in its
	// top-right corner; the words under the name run beneath the mark.
	const marked = node.drillDown === undefined ? 0 : DRILL_MARK_ROOM;
	const title = prepare(node.name, TITLE);
	const note = prepare(node.responsibility ?? "", NOTE);
	const natural = Math.max(measureNaturalWidth(title) + marked, measureNaturalWidth(note));
	const width = Math.min(340, Math.max(260, natural + left + padding));
	const available = width - left - padding;
	const titles = runsFor(title, TITLE, available - marked, left, padding);
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
	const paintedWidth = Math.max(
		...titles.map((run) => run.width + marked),
		...notes.map((run) => run.width),
		0,
	);
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
 * How many lines end inside a word: Pretext breaks a word wider than the line
 * between two of its letters rather than let it overflow.
 * @param prepared The measured text.
 * @param width The width the lines wrap at.
 * @returns The number of words broken.
 */
function wordBreaks(prepared: ReturnType<typeof prepareWithSegments>, width: number): number {
	let breaks = 0;
	walkLineRanges(prepared, width, (line) => {
		// A line that ends between segments ends at a place the text may break.
		if (line.end.graphemeIndex > 0) breaks += 1;
	});
	return breaks;
}

/**
 * The narrowest wrap width that keeps the line count the widest wrap gives,
 * so wrapped words share their lines evenly instead of leaving one word alone
 * on the last, and that breaks no word the widest wrap keeps whole.
 * @param prepared The measured text.
 * @param limit The widest the lines may be.
 * @returns A width at most `limit` that breaks into no more lines, and inside
 *   no more words, than `limit` does.
 */
function balancedWrapWidth(
	prepared: ReturnType<typeof prepareWithSegments>,
	limit: number,
): number {
	const lines = measureLineStats(prepared, limit).lineCount;
	if (lines <= 1) {
		return limit;
	}
	const breaks = wordBreaks(prepared, limit);
	/**
	 * Whether a narrower wrap is as good as the widest: no more lines, no more broken words.
	 * @param width The narrower wrap's width.
	 * @returns Whether it serves.
	 */
	const fitsAt = (width: number): boolean =>
		measureLineStats(prepared, width).lineCount <= lines && wordBreaks(prepared, width) <= breaks;
	let tooNarrow = measureNaturalWidth(prepared) / lines;
	let fits = limit;
	while (fits - tooNarrow > 0.5) {
		const middle = (tooNarrow + fits) / 2;
		if (fitsAt(middle)) {
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

/** How a card's name is set when the picture is seen from far away. */
interface FarTitle {
	/** The type chip's side, and where it stands, relative to the card's corner. */
	readonly chip: { readonly x: number; readonly y: number; readonly size: number };
	/** The name's lines, relative to the card's corner. */
	readonly runs: readonly TextRun[];
}

/** Room a far name keeps from its card's sides. */
const FAR_PADDING_X = 16;
/** Room a far name keeps from its card's top and bottom. */
const FAR_PADDING_Y = 12;
/** The largest a far name is set. */
const FAR_MAX_SIZE = 44;
/**
 * The most of a card's height one line of its far name may take: set larger,
 * a name fills its card like a word in a box rather than a title on a card.
 */
const FAR_HEIGHT_SHARE = 0.36;
/** The step between one line of a far name and the next, per unit of its size: display leading. */
const FAR_LINE = 1.15;
/** A far card's chip, per unit of its name's size. */
const FAR_CHIP = 1.25;
/** The gap between a far chip and its name, per unit of the name's size. */
const FAR_GAP = 0.5;
/** The most lines a far name takes. */
const FAR_LINES = 2;
/**
 * How much smaller a picture's far names may be set to keep every one of them
 * on one line: a picture whose names all read on one line reads as one set,
 * where a mix of one and two lines reads as ragged.
 */
const FAR_ONE_LINE_SHARE = 0.85;

/** A title a picture draws from far away: its text and the box it stands in. */
interface FarSubject {
	readonly name: string;
	readonly box: { readonly width: number; readonly height: number };
}

/**
 * The size a picture's far names are set at, one for all of them so they read
 * as one set: the largest every name fits at on one line, when that is not
 * much smaller than the largest every name fits at on two, else that.
 * @param subjects The cards whose names are drawn.
 * @returns The size, or {@link FAR_MAX_SIZE} for a picture with no cards.
 */
function farSizeFor(subjects: readonly FarSubject[]): number {
	const one = sharedFarSize(subjects, 1);
	const two = sharedFarSize(subjects, FAR_LINES);
	return one >= two * FAR_ONE_LINE_SHARE ? one : two;
}

/**
 * The largest size every one of some names fits at from far away.
 * @param subjects The cards whose names are drawn.
 * @param lines The most lines a name may take.
 * @returns The size.
 */
function sharedFarSize(subjects: readonly FarSubject[], lines: number): number {
	return Math.min(FAR_MAX_SIZE, ...subjects.map(({ name, box }) => farSizeOf(name, box, lines)));
}

/**
 * The largest size a name fits at from far away: its balanced wrap on at
 * most some lines beside its type chip grown to match, a line taking no more
 * than {@link FAR_HEIGHT_SHARE} of the box, and never smaller than the name
 * drawn near.
 * @param name The name.
 * @param box The box it stands in.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param lines The most lines it may take.
 * @returns The size.
 */
function farSizeOf(
	name: string,
	box: { width: number; height: number },
	lines: number = FAR_LINES,
): number {
	let low = TITLE.fontSize;
	let high = Math.max(low, Math.min(FAR_MAX_SIZE, box.height * FAR_HEIGHT_SHARE));
	while (high - low > 0.5) {
		const middle = (low + high) / 2;
		if (farLines(name, box, middle, lines) === undefined) high = middle;
		else low = middle;
	}
	return Math.floor(low * 2) / 2;
}

/**
 * A name set from far away, beside its type chip grown to match, its
 * responsibility left out: from far away the name is what a reader can still
 * take in. A card's name and chip stand centred in the card as one block; a
 * container's stand at its header's start, as a heading does.
 * @param name The name.
 * @param box The box it stands in: a card, or a container's header.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param place Its size, at most {@link farSizeOf} the box, and where the block stands.
 * @param place.size The name's size.
 * @param place.align Centred in the box, or at its start.
 * @returns The chip's place and the name's lines.
 */
function measureFarTitle(
	name: string,
	box: { width: number; height: number },
	place: { size: number; align: "centre" | "start" },
): FarTitle {
	const lines = farLines(name, box, place.size, FAR_LINES) ?? farWrap(name, box, place.size);
	return farTitleAt(box, place, lines);
}

/**
 * A far name's lines at one size, when they fit the box beside the chip on
 * at most some lines, broken only between words.
 * @param name The name.
 * @param box The box it stands in.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param size The name's size.
 * @param most The most lines it may take.
 * @returns The lines, or nothing when they do not fit.
 */
function farLines(
	name: string,
	box: { width: number; height: number },
	size: number,
	most: number,
): string[] | undefined {
	const style = farStyle(size);
	const lines = farWrap(name, box, size);
	// At a size where one word is wider than the room, the wrap breaks it, which a far name never is.
	const whole = lines.join(" ") === name.split(/\s+/u).join(" ");
	const fits =
		whole &&
		lines.length <= most &&
		lines.length * style.lineHeight <= box.height - FAR_PADDING_Y * 2 &&
		lines.every((line) => exactWidth(line, style) <= farRoom(box, size));
	return fits ? lines : undefined;
}

/**
 * A far name wrapped, balanced, to the room beside the chip at one size, as
 * the name drawn near would wrap: a word wider than the room breaks.
 * @param name The name.
 * @param box The box it stands in.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param size The name's size.
 * @returns The lines.
 */
function farWrap(name: string, box: { width: number; height: number }, size: number): string[] {
	const style = farStyle(size);
	const prepared = prepare(name, style);
	return layoutWithLines(
		prepared,
		balancedWrapWidth(prepared, farRoom(box, size)),
		style.lineHeight,
	).lines.map(({ text }) => text.trimEnd());
}

/**
 * A far name's face at one size.
 * @param size The name's size.
 * @returns The title's face, at that size with display leading.
 */
function farStyle(size: number): TextStyle {
	return { ...TITLE, fontSize: size, lineHeight: size * FAR_LINE };
}

/**
 * The width a far name has beside its chip at one size.
 * @param box The box it stands in.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param size The name's size.
 * @returns The width.
 */
function farRoom(box: { width: number; height: number }, size: number): number {
	return box.width - FAR_PADDING_X * 2 - farChip(box, size) - size * FAR_GAP;
}

/**
 * A far chip's side at one name size: in proportion to the name, and no
 * taller than the box holds.
 * @param box The box it stands in.
 * @param box.height Its height.
 * @param size The name's size.
 * @returns The side.
 */
function farChip(box: { height: number }, size: number): number {
	return Math.min(size * FAR_CHIP, box.height - FAR_PADDING_Y * 2);
}

/**
 * Stand a far name's lines and chip in their box: the chip, then the lines
 * beside it, as one block centred top to bottom, and centred across the box
 * or at its start.
 * @param box The box it stands in.
 * @param box.width Its width.
 * @param box.height Its height.
 * @param place The name's size and where the block stands.
 * @param place.size The name's size.
 * @param place.align Centred in the box, or at its start.
 * @param lines The name's lines.
 * @returns The chip's place and the name's runs.
 */
function farTitleAt(
	box: { width: number; height: number },
	place: { size: number; align: "centre" | "start" },
	lines: readonly string[],
): FarTitle {
	const { size } = place;
	const style = farStyle(size);
	const chip = farChip(box, size);
	const widths = lines.map((text) => exactWidth(text, style));
	const block = chip + size * FAR_GAP + Math.max(0, ...widths);
	const left =
		place.align === "centre" ? Math.max(FAR_PADDING_X, (box.width - block) / 2) : FAR_PADDING_X;
	const x = left + chip + size * FAR_GAP;
	const top = (box.height - lines.length * style.lineHeight) / 2;
	return {
		chip: { x: left, y: (box.height - chip) / 2, size: chip },
		runs: lines.map((text, index) => ({
			text,
			width: widths[index]!,
			x,
			// The baseline stands half a cap height below the line's middle.
			y: top + style.lineHeight / 2 + size * 0.35 + index * style.lineHeight,
			font: style.font,
			fontSize: size,
			role: "title",
		})),
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
 * @param policy The vault's groups, in order, when groups gather and colour cards, and its
 * relationship kinds, which say how each line is drawn.
 * @param steps The lines that are flow steps drawn on the board.
 * @returns Text, card minima, container headers, relationship labels, how each line is
 * drawn, and group captions.
 */
function measureArchitecture(
	content: VariantContent,
	policy: Pick<SemanticPolicy, "groups" | "relationshipKinds"> = DEFAULT_SEMANTIC_POLICY,
	steps: ReadonlySet<string> = new Set(),
): MeasuredArchitecture {
	const containers = new Set(content.nodes.flatMap((node) => (node.parent ? [node.parent] : [])));
	const placing = gatheringGroups(content.nodes, policy);
	return {
		nodes: new Map(
			content.nodes.map((node) => [node.id, measureNode(node, containers.has(node.id))]),
		),
		labels: new Map(
			content.edges.flatMap((edge) => (edge.label ? [[edge.id, measureLabel(edge.label)]] : [])),
		),
		lines: lineLooks(content.edges, policy, steps),
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

export {
	measureArchitecture,
	farSizeFor,
	farSizeOf,
	measureFarTitle,
	measureMessageLines,
	measureNoteLines,
	type FarTitle,
};
