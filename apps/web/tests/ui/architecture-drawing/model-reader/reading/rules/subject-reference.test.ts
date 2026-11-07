// What a reference to a selection says: enough for a reader or an agent to find
// each subject again.

import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/model/content";

import { SHOP } from "#tests/ui/support/model-reader/scene.ts";
import { subjectReference } from "#ui/architecture-drawing/model-reader/reading/rules/subject-reference.ts";

const ADDRESS = "http://127.0.0.1:3000/?modelA=Shop";

/** A model with one relationship that names what it carries. */
const SAID: Model = {
	...SHOP,
	relationships: [
		{
			id: "said",
			from: "Shop#Handler",
			to: "Shop#Queue",
			order: 0,
			kind: "call",
			label: "enqueue the order",
			emphasis: "normal",
		},
	],
};

/**
 * The reference to some subjects of the model.
 * @param ids The subjects.
 * @returns Its lines.
 */
function referenceTo(...ids: readonly string[]): readonly string[] {
	const reading = { model: SAID, projection: projectModel(SAID), ids: new Set(ids) };
	return subjectReference(reading, ADDRESS).split("\n");
}

test("a relationship's reference names its identity, ends, kind and words, then the address", () => {
	const [from, to] = ["Shop#Handler", "Shop#Queue"].map(
		(id) => SAID.modules.find((module) => module.id === id)?.name,
	);
	expect(referenceTo("said")).toEqual([
		`Relationship said: ${from} → ${to}, call, "enqueue the order"`,
		ADDRESS,
	]);
});

test("a selection of several names each subject, and an unknown one by its identity", () => {
	const [first, second, last] = referenceTo("Shop#Handler", "not-a-subject");
	expect(first).toStartWith("Module Shop#Handler: ");
	expect(second).toBe("not-a-subject");
	expect(last).toBe(ADDRESS);
});
