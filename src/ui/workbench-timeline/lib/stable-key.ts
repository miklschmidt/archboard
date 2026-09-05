// A stable key for a value that has no identity of its own, derived from its
// bounded inert details so hostile values cannot grow it.

import { boundedDetails } from "@/ui/workbench-timeline/lib/details";

/**
 * A short stable key for any value.
 * @param value The value.
 * @returns A base-36 FNV-1a hash of its bounded details.
 */
function stableBoundedKey(value: unknown): string {
	const source = boundedDetails(value).text;
	let hash = 2_166_136_261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36);
}

export { stableBoundedKey };
