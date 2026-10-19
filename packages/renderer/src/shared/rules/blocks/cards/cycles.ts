// A depth-first walk over the lines one block draws, which finds the lines
// that close a cycle there, so they can run upward.

/** A line as the walk reads it: the relationship it draws and the item it goes to. */
interface Walked {
	readonly edge: { readonly id: string };
	readonly to: string;
}

/** A depth-first walk over one block's projections that finds the ones closing a cycle. */
class CycleWalk {
	readonly back = new Set<string>();
	readonly state = new Map<string, "open" | "done">();

	/**
	 * A walk over the projections leaving each item.
	 * @param out The lines leaving each item.
	 */
	constructor(readonly out: ReadonlyMap<string, readonly Walked[]>) {}

	/**
	 * Walk from one item, unless the walk has been there.
	 * @param item The item.
	 */
	from(item: string): void {
		if (this.state.has(item)) return;
		this.state.set(item, "open");
		for (const projection of this.out.get(item) ?? []) {
			if (this.state.get(projection.to) === "open") this.back.add(projection.edge.id);
			else this.from(projection.to);
		}
		this.state.set(item, "done");
	}
}

export { CycleWalk };
