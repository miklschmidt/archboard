import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";

/**
 * Preserve authored sibling and relationship order through native layout.
 * @param shape A native shape carrying the authored order.
 * @returns Its numeric order.
 */
function semanticOrder(shape: ElkNode | ElkExtendedEdge): number {
	return Number(shape.layoutOptions?.["archboard.order"] ?? 0);
}

export { semanticOrder };
