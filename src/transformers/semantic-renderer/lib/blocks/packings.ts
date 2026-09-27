// The ways a block of blocks may be packed: its items cut, in the order
// their lines run, into rows or columns, and each of those with a later item
// moved up into an earlier row or column that has room for it.
import type { Size } from "@/transformers/semantic-renderer/lib/blocks/tree";

/** The most blocks whose every packing is tried. */
const EVERY_PACKING = 9;
/** How nearly a packing's estimated fit must reach the best one's to be laid out and weighed. */
const WORTH_LAYING = 0.8;
/** How a block's items are packed: in rows read left to right, or in columns read down. */
interface Packing {
	readonly across: boolean;
	readonly groups: readonly (readonly number[])[];
	/** Room between two packed blocks, and left of them, when trunks need more than the least. */
	readonly gap?: number;
	readonly margin?: number;
}

/**
 * Every way to cut a sequence into consecutive groups.
 * @param count How many items are left.
 * @param sizes The group sizes chosen so far.
 * @returns Each cut as its group sizes.
 */
function everyCut(count: number, sizes: readonly number[] = []): number[][] {
	if (count === 0) return [[...sizes]];
	return Array.from({ length: count }, (_, index) =>
		everyCut(count - index - 1, [...sizes, index + 1]),
	).flat();
}

/**
 * The cuts of a sequence worth trying: every one for a few items, else one
 * to four even groups.
 * @param count How many items.
 * @returns Each cut as its group sizes.
 */
function cutsOf(count: number): number[][] {
	if (count <= EVERY_PACKING) return everyCut(count);
	return [1, 2, 3, 4].map((groups) =>
		Array.from(
			{ length: groups },
			(_, group) =>
				Math.floor(((group + 1) * count) / groups) - Math.floor((group * count) / groups),
		),
	);
}

/**
 * How long and how thick one group is: along the way it is read, and across it.
 * @param sizes Its items' sizes.
 * @param across Whether it is a row.
 * @param gap The room between two items.
 * @returns Its length and thickness.
 */
function extentOf(
	sizes: readonly Size[],
	across: boolean,
	gap: number,
): { long: number; thick: number } {
	const along = sizes.map(({ width, height }) => (across ? width : height));
	const breadth = sizes.map(({ width, height }) => (across ? height : width));
	return {
		long: along.reduce((sum, value) => sum + value, 0) + (sizes.length - 1) * gap,
		thick: Math.max(...breadth),
	};
}

/** The most packings with an item moved up that are laid out and weighed besides the cuts. */
const MOST_BACKFILLED = 4;

/**
 * Every packing that cuts the items, in order, into consecutive groups.
 * @param order The items, in the order their lines run.
 * @returns The packings, rows first.
 */
function cutPackings(order: readonly number[]): Packing[] {
	return [true, false].flatMap((across) =>
		cutsOf(order.length).map((sizes) => ({
			across,
			groups: sizes.map((size, index) => {
				const start = sizes.slice(0, index).reduce((sum, value) => sum + value, 0);
				return order.slice(start, start + size);
			}),
		})),
	);
}

/**
 * A packing with one item moved from its group into an earlier one, at its
 * start or its end, where that makes the earlier group no longer than the
 * longest: a small block late in the order then fills the room a short row
 * or column leaves, instead of widening the page on a row of its own.
 * @param packing The packing.
 * @param lengthOf How long a group is, along the way it is read.
 * @returns The packings with an item moved up.
 */
function backfilled(packing: Packing, lengthOf: (group: readonly number[]) => number): Packing[] {
	const { across, groups } = packing;
	const longest = Math.max(...groups.map(lengthOf));
	return groups.slice(1).flatMap((group, before) =>
		group.flatMap((item) =>
			groups.slice(0, before + 1).flatMap((earlier, into) =>
				// A column is read down, so an item joins one at its foot, after what leads to it.
				(across
					? [
							[item, ...earlier],
							[...earlier, item],
						]
					: [[...earlier, item]]
				)
					.filter((filled) => lengthOf(filled) <= longest)
					.map((filled) => ({
						across,
						groups: groups
							.map((one, at) => (at === into ? filled : one.filter((other) => other !== item)))
							.filter((one) => one.length > 0),
					})),
			),
		),
	);
}

/**
 * What a packing's groups hold, whatever their order.
 * @param packing The packing.
 * @returns A key two packings share when their groups hold the same items.
 */
function membersOf(packing: Packing): string {
	const groups = packing.groups.map((group) => group.toSorted((one, other) => one - other));
	return JSON.stringify({ across: packing.across, groups });
}

/**
 * The packings worth laying out: every cut whose estimated fit comes near
 * the best cut's, and the few best packings with an item moved up that do too.
 * @param order The items, in the order their lines run.
 * @param lengthOf How long a group is, read one way.
 * @param fitOf How well a packing's estimated size fits the reference pane.
 * @returns The packings.
 */
function packingsOf(
	order: readonly number[],
	lengthOf: (group: readonly number[], across: boolean) => number,
	fitOf: (packing: Packing) => number,
): Packing[] {
	const cuts = cutPackings(order);
	const fits = cuts.map(fitOf);
	const least = Math.max(...fits) * WORTH_LAYING;
	// A packing that only reorders a cut's groups fills no room the cut leaves.
	const cut = new Set(cuts.map(membersOf));
	const moved = new Map(
		cuts
			.flatMap((packing) => backfilled(packing, (group) => lengthOf(group, packing.across)))
			.filter((packing) => !cut.has(membersOf(packing)))
			.map((packing) => [JSON.stringify(packing), packing] as const),
	);
	const filled = [...moved.values()]
		.map((packing) => ({ packing, fit: fitOf(packing) }))
		.filter(({ fit }) => fit >= least)
		.toSorted((one, other) => other.fit - one.fit)
		.slice(0, MOST_BACKFILLED)
		.map(({ packing }) => packing);
	return [...cuts.filter((_, index) => fits[index]! >= least), ...filled];
}

export { extentOf, packingsOf, type Packing };
