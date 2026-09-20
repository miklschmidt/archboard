/** Distance between automatically assigned positions in one collection. */
const ORDER_STEP = 1000;

/**
 * Keep a subject's position when restated, or append a new subject after the
 * greatest position. Agents can also state a position explicitly.
 * @param subjects Existing nodes or relationships in this variant.
 * @param id The subject's continuing or newly minted identity.
 * @param stated A position supplied by the author, if any.
 * @returns The position to persist.
 */
function subjectOrder(
	subjects: readonly { readonly id: string; readonly order: number }[],
	id: string,
	stated: number | undefined,
): number {
	if (stated !== undefined) {
		return stated;
	}
	const existing = subjects.find((subject) => subject.id === id);
	return existing?.order ?? Math.max(0, ...subjects.map((subject) => subject.order)) + ORDER_STEP;
}

export { ORDER_STEP, subjectOrder };
