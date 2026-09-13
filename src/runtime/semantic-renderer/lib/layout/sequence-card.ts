// The sequence grammar keeps equal-width participant columns and compact cards.
import type { SemanticNode } from "@/shared/semantic-board/index";
import type { Box } from "@/runtime/semantic-renderer/lib/geometry";
import {
	CARD_PADDING_X,
	ICON_CHIP_SIZE,
	ICON_CHIP_GAP,
	CARD_HEIGHT,
	CARD_HEIGHT_WITH_NOTE,
} from "@/runtime/semantic-renderer/lib/design";

/** One participant heading in a message sequence. */
interface SequenceCard {
	readonly node: SemanticNode;
	readonly box: Box;
	readonly titleSize: number;
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
 * @param node The participant.
 * @returns The heading height.
 */
function cardHeight(node: SemanticNode): number {
	return node.responsibility === undefined ? CARD_HEIGHT : CARD_HEIGHT_WITH_NOTE;
}

export { type SequenceCard, cardTextWidth, cardHeight };
