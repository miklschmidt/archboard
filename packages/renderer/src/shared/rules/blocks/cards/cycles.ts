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
