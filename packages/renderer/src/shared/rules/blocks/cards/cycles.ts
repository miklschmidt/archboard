// A depth-first walk over the lines one block draws, which finds the lines
// that close a cycle there, so they can run upward.

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
	 * Preserve authored cycles, then find cycles added by containment.
	 * @param items The authored item order.
	 * @param containment Each member and the container title above it.
	 * @returns The relationships that run upward.
	 */
	withContainment(
		items: readonly string[],
		containment: readonly (readonly [string, string])[],
	): ReadonlySet<string> {
		const back = new Set(this.walk(items));
		const constrained = this.ranked(back);
		for (const [member, around] of containment) constrained.add(around, member);
		const frames = [...new Set(containment.map(([, around]) => around))];
		for (const id of constrained.walk([...frames, ...items]))
			if (back.has(id)) back.delete(id);
			else back.add(id);
		return back;
	}

	/**
	 * Read the same graph in the direction its existing cycles rank it.
	 * @param back The relationships already ranked upward.
	 * @returns A fresh walk over the ranked graph.
	 */
	private ranked(back: ReadonlySet<string>): CycleWalk {
		const ranked = new CycleWalk();
		for (const [from, links] of this.out)
			for (const { to, edge } of links) {
				const reverse = edge !== undefined && back.has(edge);
				ranked.add(reverse ? to : from, reverse ? from : to, edge);
			}
		return ranked;
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
