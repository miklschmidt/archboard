/**
 * Freeze one owner's group of durations. Each key is typed as a number, not as
 * today's value, so a caller's types never depend on how a duration is tuned,
 * and each key keeps the reason written beside it.
 * @param group The owner's durations in milliseconds, each with its reason.
 * @returns The same group, frozen.
 */
function durations<Group extends Record<string, number>>(
	group: Group,
): { readonly [Key in keyof Group]: number } {
	return Object.freeze(group);
}

export { durations };
