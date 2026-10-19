// The order a block of cards holds its ports in on a face. A block of cards is
// laid out before its parent, so Graphviz orders the ports on its top and
// bottom, and the cards and labels under them, from its own lines alone.
// Settling then stands each port where its trunk's other end wants it, which
// can swap two of them; the block is routed again with its ports moved, but
// its cards and labels keep the old order, so the lines cross inside it. The
// ports settling swaps are held in its order on a second layout.
import type { Laid } from "#shared/rules/blocks/tree/laid.ts";
import type { Box } from "#shared/rules/geometry.ts";
import { settledPorts, type Settling } from "#shared/rules/blocks/packing/settle.ts";

/**
 * The ports on each face of a block that settling stands in another order than
 * the block's own layout, in the order settling stands them.
 * @param settling The blocks, laid out; nothing is changed.
 * @returns Each face's held ports, keyed `block|face`, where two or more are.
 */
function heldOrders(settling: Settling): Map<string, string[]> {
	const orders = new Map<string, string[]>();
	for (const [id, ports] of settledPorts(settling)) {
		const block = settling.tree.blocks.get(id)!;
		for (const face of ["top", "bottom"] as const) {
			const onFace = [...ports].filter(([port]) => block.ports.get(port) === face);
			const swapped = inverted(onFace, settling.laid.get(id)!);
			if (swapped.length > 1) orders.set(`${id}|${face}`, swapped);
		}
	}
	return orders;
}

/**
 * The ports that stand on the other side of some other port once settled
 * than where the block laid them, in their settled order.
 * @param ports Each port and its settled x.
 * @param laid The block as laid out.
 * @returns The ports.
 */
function inverted(ports: readonly (readonly [string, number])[], laid: Laid): string[] {
	const was = new Map(ports.map(([port]) => [port, middleOf(laid.boxes.get(port)!)]));
	return ports
		.filter(([port, x]) =>
			ports.some(
				([other, at]) => other !== port && (x - at) * (was.get(port)! - was.get(other)!) < 0,
			),
		)
		.toSorted((one, other) => one[1] - other[1])
		.map(([port]) => port);
}

/**
 * A box's middle across.
 * @param box The box.
 * @returns Its x.
 */
function middleOf(box: Box): number {
	return box.x + box.width / 2;
}

export { heldOrders };
