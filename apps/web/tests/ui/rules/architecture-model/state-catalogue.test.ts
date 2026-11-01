import { expect, test } from "bun:test";
import type { Model } from "@archboard/board/content";
import { stateCatalogue } from "#ui/rules/architecture-model/state-catalogue.ts";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";

const DRAFT: Model["proposals"][number] = {
	schemaVersion: 1,
	id: "Draft",
	name: "Queue",
	lifecycle: "draft",
	predecessor: "Current",
	predecessorRevision: "a".repeat(64),
	baseline: "b".repeat(40),
	changes: [],
	file: "draft.proposal.json",
};
const SNAPSHOT: Model = { ...SHOP, proposals: [DRAFT] };

test("a snapshot lists its states in the places that the complete catalogue gives them", () => {
	expect(stateCatalogue(SNAPSHOT).map((state) => state.id)).toEqual(["Current", "Draft"]);
});

test("a model with no Current lists only its proposals", () => {
	const manifest = { ...SNAPSHOT.manifest, current: null };
	expect(stateCatalogue({ ...SNAPSHOT, manifest }).map((state) => state.id)).toEqual(["Draft"]);
});
