import type { Side } from "#shared/rules/blocks/tree/tree.ts";

/**
 * What a port on a side wall adds to its key: the line's end inside the
 * block. Each line crosses a wall on the track it runs on inside, so lines
 * from different items never share a wall port.
 * @param side The edge the port crosses.
 * @param inner The line's end inside the block.
 * @returns The key's part, empty for a port on the top or bottom.
 */
function walled(side: Side, inner: string): string {
	return side === "left" || side === "right" ? `${inner}|` : "";
}

export { walled };
