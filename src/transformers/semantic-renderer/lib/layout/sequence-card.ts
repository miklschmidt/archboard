// The sequence grammar keeps equal-width participant columns and compact cards.
import type { SemanticNode } from "@/shared/semantic-board/index";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import { measureNoteLines } from "@/transformers/semantic-renderer/lib/measurement";
import { CARD_NOTE_FONT, CARD_TITLE_FONT } from "@/transformers/semantic-renderer/lib/fonts";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import {
	CARD_PADDING_X,
	ICON_CHIP_SIZE,
	ICON_CHIP_GAP,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
	NOTE_SIZE,
	TEXT_LINE_HEIGHT,
	TITLE_SIZE,
} from "@/transformers/semantic-renderer/lib/design";

/** One participant heading in a message sequence. */
interface SequenceCard {
	readonly node: SemanticNode;
	readonly box: Box;
	readonly titleSize: number;
	readonly notes: readonly TextRun[];
}

/**
 * The horizontal run left after padding and the kind glyph.
 * @param cardWidth The column's card width.
 * @returns Text space in diagram units.
 */
function cardTextWidth(cardWidth: number): number {
	return cardWidth - CARD_PADDING_X * 2 - ICON_CHIP_SIZE - ICON_CHIP_GAP;
}

/**
 * A participant heading's height, including its optional responsibility.
 * @param notes The complete measured responsibility lines.
 * @returns The heading height.
 */
function cardHeight(notes: readonly TextRun[]): number {
	return notes.length === 0
		? CARD_HEIGHT
		: CARD_HEIGHT_WITH_NOTE + (notes.length - 1) * NOTE_SIZE * TEXT_LINE_HEIGHT;
}

/**
 * Reserve every responsibility line before placing participant cards and lifelines.
 * @param node The participant.
 * @param width The shared card width.
 * @returns Complete measured lines, with no truncation.
 */
function cardNotes(node: SemanticNode, width: number): TextRun[] {
	return measureNoteLines(
		node.responsibility ?? "",
		cardTextWidth(width),
		NOTE_SIZE,
		NOTE_SIZE * TEXT_LINE_HEIGHT,
	);
}

/**
 * The width one participant's card asks for: chip, name, and responsibility.
 * @param node The participant.
 * @returns The natural width of the longest authored line, including card insets.
 */
function cardContentWidth(node: SemanticNode): number {
	const noteWidth = (node.responsibility ?? "")
		.split(/\r\n?|\n/u)
		.reduce((width, line) => Math.max(width, measure(line, CARD_NOTE_FONT, NOTE_SIZE)), 0);
	return (
		CARD_PADDING_X * 2 +
		ICON_CHIP_SIZE +
		ICON_CHIP_GAP +
		Math.max(measure(node.name, CARD_TITLE_FONT, TITLE_SIZE), noteWidth)
	);
}

export { type SequenceCard, cardTextWidth, cardHeight, cardNotes, cardContentWidth };
