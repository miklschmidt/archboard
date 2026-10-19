// A card as the block engine keeps it (TASK-349): its measured size and the
// peers it is interchangeable with.
import type { ElkNode } from "@archboard/elk-rs";
import { semanticOrder } from "#shared/rules/layout/semantic-order.ts";

/** A card as a block lays it out: its size and its peers. */
interface Card {
	readonly width: number;
	readonly height: number;
	/** What interchangeable cards share, when the card has any: kind and responsibility. */
	readonly peers: string | undefined;
}

/**
 * A measured card as the blocks keep it.
 * @param node The measured card.
 * @returns Its size and peer group.
 */
function cardOf(node: ElkNode): Card {
	const peers = node.layoutOptions?.["archboard.order-group"];
	return {
		width: node.width!,
		height: node.height!,
		peers: peers === String(semanticOrder(node)) ? undefined : peers,
	};
}

export { cardOf, type Card };
