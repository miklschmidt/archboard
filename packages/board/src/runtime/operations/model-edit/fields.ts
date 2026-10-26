import { ArchiveError } from "#runtime/store/model-archive.ts";
/**
 * Preserve omitted fields and refuse contradictory clearing.
 * @param value The continuing subject.
 * @param set The assigned values.
 * @param clear The explicitly removed fields.
 */
function assignFields(
	value: object,
	set: object | undefined,
	clear: readonly string[] | undefined,
): void {
	const overlap = clear?.find((field) => set !== undefined && Object.hasOwn(set, field));
	if (overlap !== undefined)
		throw new ArchiveError("MODEL_INVALID", `Field ${overlap} is both assigned and cleared.`);
	Object.assign(value, set);
	for (const field of clear ?? []) Reflect.deleteProperty(value, field);
}
export { assignFields };
