// The sequence grammar keeps equal-width participant columns and compact cards.
import type { SemanticNode } from "@archboard/board/content";
import type { Box } from "#shared/rules/geometry.ts";
import type { TextRun } from "#shared/rules/render/drawing.ts";
import { measureNoteLines } from "#shared/rules/text/measurement.ts";
import { CARD_NOTE_FONT, CARD_TITLE_FONT } from "#shared/rules/text/fonts.ts";
import { measure } from "#shared/rules/text/text.ts";
import { CARD_PADDING_X } from "#shared/constants/spacing.ts";
import {
	DRILL_MARK_ROOM,
	ICON_CHIP_SIZE,
	ICON_CHIP_GAP,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
	NOTE_SIZE,
	TEXT_LINE_HEIGHT,
	TITLE_SIZE,
} from "#shared/constants/design.ts";

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
 * The room a participant keeps beside its name for the mark of a part that
 * opens another board.
 * @param node The participant.
 * @returns The room, nothing for a part that opens no board.
 */
function markRoom(node: SemanticNode): number {
	return node.drillDown === undefined ? 0 : DRILL_MARK_ROOM;
}

/**
 * The run a participant's name has on a card: the text run, less the mark of a
 * part that opens another board.
 * @param node The participant.
 * @param cardWidth The column's card width.
 * @returns Name space in diagram units.
 */
function titleRoom(node: SemanticNode, cardWidth: number): number {
	return cardTextWidth(cardWidth) - markRoom(node);
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
		Math.max(measure(node.name, CARD_TITLE_FONT, TITLE_SIZE) + markRoom(node), noteWidth)
	);
}

export {
	type SequenceCard,
	cardTextWidth,
	cardHeight,
	cardNotes,
	cardContentWidth,
	markRoom,
	titleRoom,
};
