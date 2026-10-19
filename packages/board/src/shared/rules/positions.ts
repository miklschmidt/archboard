// Where a node or a relationship sits among its own kind: its `order`, one
// position per subject. A draft and its predecessor each give the next free
// position to what they add, so both can give the same one. What the
// predecessor added then arrives at a position this proposal already gave
// away, and the merged proposal would hold two subjects in one place. Nobody
// chose that position for its meaning, so nobody has a disagreement to settle:
// the arriving subject takes the next free position, as it would have if it had
// been added here.

/** Distance between automatically assigned positions in one collection. */
const ORDER_STEP = 1000;

/**
 * Move each subject the predecessor added whose position this proposal already
 * uses to the next free position after every other subject.
 * @param subjects The merged subjects of one kind.
 * @param held The subjects of that kind this proposal held before the merge.
 * @returns The subjects, each at a position of its own.
 */
function placedArrivals<Subject extends { readonly id: string; readonly order: number }>(
	subjects: readonly Subject[],
	held: readonly { readonly id: string }[],
): Subject[] {
	const kept = new Set(held.map(({ id }) => id));
	const arriving = new Set(subjects.filter(({ id }) => !kept.has(id)).map(({ id }) => id));
	const taken = new Set(subjects.filter(({ id }) => !arriving.has(id)).map(({ order }) => order));
	let last = Math.max(0, ...subjects.map(({ order }) => order));
	return subjects.map((subject) => {
		if (!arriving.has(subject.id) || !taken.has(subject.order)) return subject;
		last += ORDER_STEP;
		return { ...subject, order: last };
	});
}

export { ORDER_STEP, placedArrivals };
