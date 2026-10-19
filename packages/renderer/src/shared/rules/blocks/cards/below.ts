// Which vendor nodes Graphviz must rank below which: the edges a block's
// graph holds, read as a reach, so an invisible edge that would close a loop
// can be left out (`clusters.ts`, `entry-row.ts`).

/** Which vendor nodes Graphviz must rank below which, as edges are added. */
class Below {
	readonly next = new Map<string, string[]>();

	/**
	 * Record that one vendor node ranks below another.
	 * @param tail The upper node.
	 * @param head The lower node.
	 */
	add(tail: string, head: string): void {
		const next = this.next.get(tail);
		if (next === undefined) this.next.set(tail, [head]);
		else next.push(head);
	}

	/**
	 * Every vendor node one leads down to, itself among them.
	 * @param from Where to start.
	 * @returns The nodes.
	 */
	reach(from: string): Set<string> {
		const seen = new Set<string>();
		const open = [from];
		while (open.length > 0) {
			const at = open.pop()!;
			if (!seen.has(at)) open.push(...(this.next.get(at) ?? []));
			seen.add(at);
		}
		return seen;
	}

	/**
	 * Whether one vendor node leads down to another.
	 * @param from Where to start.
	 * @param target Where to arrive.
	 * @returns True when it does.
	 */
	reaches(from: string, target: string): boolean {
		const seen = new Set<string>();
		const open = [from];
		while (open.length > 0) {
			const at = open.pop()!;
			if (at === target) return true;
			if (!seen.has(at)) open.push(...(this.next.get(at) ?? []));
			seen.add(at);
		}
		return false;
	}
}

export { Below };
