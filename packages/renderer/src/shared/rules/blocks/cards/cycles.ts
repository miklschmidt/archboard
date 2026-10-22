// A depth-first walk over the lines one block draws, which finds the lines
// that close a cycle there, so they can run upward.

import { Below } from "#shared/rules/blocks/cards/below.ts";

/** A depth-first walk over one block's projections that finds the ones closing a cycle. */
class CycleWalk {
	readonly back = new Set<string>();
	readonly state = new Map<string, "open" | "done">();

	/**
	 * The ordering constraints leaving each item.
	 */
	readonly out = new Map<string, { to: string; edge: string | undefined }[]>();

	/**
	 * Add an ordering constraint. Containment has no relationship to reverse.
	 * @param from The item above the constraint.
	 * @param to The item below it.
	 * @param edge The authored relationship, if any.
	 */
	add(from: string, to: string, edge?: string): void {
		this.out.set(from, [...(this.out.get(from) ?? []), { to, edge }]);
	}

	/**
	 * Find cycles from unconstrained roots first, then in authored order.
	 * @param items The ordered items.
	 * @returns The relationships that close cycles.
	 */
	walk(items: readonly string[]): ReadonlySet<string> {
		const pointed = new Set([...this.out.values()].flat().map(({ to }) => to));
		for (const item of items.filter((one) => !pointed.has(one))) this.from(item);
		for (const item of items) this.from(item);
		return this.back;
	}

	/**
	 * Add only containment constraints that participate in a cycle.
	 * @param items The authored item order.
	 * @param containment Each member and the container title above it.
	 * @returns The relationships that run upward.
	 */
	withContainment(
		items: readonly string[],
		containment: readonly (readonly [string, string])[],
	): ReadonlySet<string> {
		const below = new Below();
		for (const [from, links] of this.out) for (const { to } of links) below.add(from, to);
		for (const [member, around] of containment) below.add(around, member);
		const cyclic = containment.filter(([member, around]) => below.reaches(member, around));
		for (const [member, around] of cyclic) this.add(around, member);
		const frames = [...new Set(cyclic.map(([, around]) => around))];
		return this.walk([...frames, ...items]);
	}

	/**
	 * Walk from one item, unless the walk has been there.
	 * @param item The item.
	 */
	from(item: string): void {
		if (this.state.has(item)) return;
		this.state.set(item, "open");
		for (const projection of this.out.get(item) ?? []) {
			if (this.state.get(projection.to) === "open") {
				if (projection.edge !== undefined) this.back.add(projection.edge);
			} else this.from(projection.to);
		}
		this.state.set(item, "done");
	}
}

export { CycleWalk };
