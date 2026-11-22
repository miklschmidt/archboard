import { expect, test } from "bun:test";

import { RELATIONS, type Relation } from "#shared/constants/relations.ts";
import { WAITS } from "#shared/constants/waits.ts";

/**
 * The length of one side of a relation.
 * @param side One duration, or several in a row.
 * @returns Its length in milliseconds.
 */
function length(side: Relation[0]): number {
	return (typeof side === "string" ? [side] : side).reduce((sum, wait) => sum + WAITS[wait].ms, 0);
}

test.each(RELATIONS.map((relation) => [JSON.stringify(relation), relation] as const))(
	"keeps %s",
	(_name, [shorter, relation, longer]) => {
		if (relation === "<") expect(length(shorter)).toBeLessThan(length(longer));
		else if (relation === "<=") expect(length(shorter)).toBeLessThanOrEqual(length(longer));
		else expect(length(shorter)).toBe(length(longer));
	},
);

test("every duration is a whole, positive number of milliseconds", () => {
	for (const [name, declared] of Object.entries(WAITS)) {
		expect({ name, whole: Number.isSafeInteger(declared.ms) && declared.ms > 0 }).toEqual({
			name,
			whole: true,
		});
	}
});
