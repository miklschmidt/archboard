// The vocabulary every coherence rule is written in.
//
// An issue is addressed at what it is about rather than thrown, because a
// document is checked whole: a caller that stopped at the first problem would
// make an agent fix a board one refusal at a time.

/** One reason a document is not coherent, addressed at what it is about. */
interface IntegrityIssue {
	/** Where the problem is, as a dotted path into the document. */
	readonly at: string;
	/** What is wrong, in a sentence an agent can act on. */
	readonly problem: string;
}

/**
 * Report the ids that occur more than once.
 * @param ids The ids in the order they were written.
 * @returns Each repeated id, once.
 */
function repeated(ids: readonly string[]): string[] {
	const seen = new Set<string>();
	const twice = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			twice.add(id);
		}
		seen.add(id);
	}
	return [...twice];
}

/**
 * Whether following `parentOf` from `start` ever returns to a place it has
 * already been. A chain that leaves the map ends; it is a dangling reference,
 * reported separately.
 * @param start Where to start walking.
 * @param parentOf The parent of an id, or undefined at a root.
 * @returns True when the walk revisits an id.
 */
function walkReturns(start: string, parentOf: (id: string) => string | undefined): boolean {
	const visited = new Set<string>([start]);
	let at = parentOf(start);
	while (at !== undefined) {
		if (visited.has(at)) {
			return true;
		}
		visited.add(at);
		at = parentOf(at);
	}
	return false;
}

export { type IntegrityIssue, repeated, walkReturns };
