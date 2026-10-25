// Ports that share an edge stand a lane apart. Unrelated ports that face
// each other also need separate columns: the router fixes their end segments
// and can overlap those segments when the pins stand on the same column.
import type { Box } from "#shared/rules/geometry.ts";
import { SAME, type Laid } from "#shared/rules/blocks/tree/laid.ts";
import { nearestFree, type Span } from "#shared/rules/blocks/packing/open-edge.ts";
import type { Block, BlockTree } from "#shared/rules/blocks/tree/tree.ts";
import { LANE } from "#shared/rules/track/routes/chains.ts";

/** A port with its settled column and the span where it can stand. */
interface Port {
	readonly box: Box;
	readonly block: Block;
	readonly id: string;
	readonly pin: string;
	readonly side: ReturnType<Block["ports"]["get"]>;
	readonly positions: Map<string, number>;
	readonly span: Span;
}

/**
 * Whether two ports leave their blocks toward each other.
 * @param one The first port.
 * @param other The second port.
 * @returns True when one leaves downward and the lower one leaves upward.
 */
function facing(one: Port, other: Port): boolean {
	const [upper, lower] = one.side === "bottom" ? [one, other] : [other, one];
	return (
		upper.side === "bottom" && lower.side === "top" && upper.box.y + upper.box.height <= lower.box.y
	);
}

/**
 * A port's column in its parent's coordinates.
 * @param port The port.
 * @returns The column.
 */
function columnOf(port: Port): number {
	return port.box.x + port.positions.get(port.id)!;
}

/**
 * Keep unrelated facing ports off one column before routing their trunks.
 * @param block The parent that routes the trunks.
 * @param settled Its inner blocks' positions, updated in place.
 * @param context The blocks, their layouts, and each port's available span.
 * @param context.tree The block tree.
 * @param context.laid Every block's layout.
 * @param context.spanOf The span where a port can stand.
 * @param context.inline Whether the track router draws the blocks together.
 */
function separateFacingPorts(
	block: Block,
	settled: Map<string, Map<string, number>>,
	context: {
		readonly tree: BlockTree;
		readonly laid: ReadonlyMap<string, Laid>;
		readonly spanOf: (inner: Block, port: string) => Span;
		readonly inline: boolean;
	},
): void {
	if (context.inline) return;
	const { tree, laid, spanOf } = context;
	const ports: Port[] = [...settled].flatMap(([id, positions]) => {
		const inner = tree.blocks.get(id)!;
		const box = laid.get(block.id)!.boxes.get(id)!;
		return [...positions.keys()].map((port) => ({
			block: inner,
			box,
			id: port,
			positions,
			pin: tree.pin(inner, port),
			side: inner.ports.get(port),
			span: spanOf(inner, port),
		}));
	});
	const connected = new Set(
		[...block.lines.values()].flatMap(({ from, to }) => [`${from}>${to}`, `${to}>${from}`]),
	);
	for (const one of ports) {
		const others = ports.filter((other) => {
			if (one === other) return false;
			if (one.block === other.block) return one.side === other.side;
			return facing(one, other) && !connected.has(`${one.pin}>${other.pin}`);
		});
		const x = columnOf(one);
		if (!others.some((other) => Math.abs(columnOf(other) - x) < SAME)) continue;
		const low = one.span[0] + one.box.x;
		const high = one.span[1] + one.box.x;
		const blocked = others
			.map(columnOf)
			.filter((at) => at + LANE > low && at - LANE < high)
			.map((at) => ({ x: at, y: 0, width: 0, height: 0 }));
		const free = nearestFree([low, high], blocked, LANE, x);
		if (free !== undefined)
			one.positions.set(one.id, Math.max(free[0], Math.min(free[1], x)) - one.box.x);
	}
}

/**
 * Wanted x's spread a lane apart within a span, in their order.
 * @param span The span.
 * @param wanted The x's, in order.
 * @returns The spread x's.
 */
function spread(span: Span, wanted: readonly number[]): number[] {
	const gap = wanted.length > 1 ? Math.min(LANE, (span[1] - span[0]) / (wanted.length - 1)) : 0;
	const xs = wanted.map((x) => Math.min(span[1], Math.max(span[0], x)));
	for (let index = 1; index < xs.length; index += 1)
		xs[index] = Math.max(xs[index]!, xs[index - 1]! + gap);
	for (let index = xs.length - 1; index >= 0; index -= 1)
		xs[index] = Math.min(xs[index]!, (xs[index + 1] ?? span[1] + gap) - gap);
	return xs;
}

export { separateFacingPorts, spread };
