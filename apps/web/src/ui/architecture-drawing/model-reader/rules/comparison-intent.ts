/** The `against` of a reading that shows a state alone. It sits beside `current` in that field. */
const AFTER = "after";

/**
 * What a read asks of the comparison the address names.
 * @param against The address field: a base, `after`, or null for the default base.
 * @returns The selectors of that intent.
 */
function comparisonIntent(against: string | null): { against?: string; compare?: false } {
	if (against === null) return {};
	return against === AFTER ? { compare: false } : { against };
}

export { AFTER, comparisonIntent };
