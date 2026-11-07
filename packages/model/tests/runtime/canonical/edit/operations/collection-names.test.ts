import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/model/store-read";
import { editArchitectureModule } from "@archboard/model/store-write";
import {
	structureIntent,
	disposeFixtures,
} from "#tests/runtime/canonical/edit/operations/fixture.ts";
import {
	behaviorFixture,
	allBehaviorSubjects,
} from "#tests/runtime/canonical/edit/operations/flow-fixture.ts";
import {
	proposal,
	request,
	selected,
} from "#tests/runtime/canonical/proposals/operations/fixture.ts";

afterEach(disposeFixtures);

test("collection renames retain former selectors without changing identity or retained inputs", async () => {
	const { vault } = behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const renamed = await editArchitectureModule(vault, {
		...input,
		changes: [{ type: "edit-collection", collection: "Behavior", name: "Exchanges" }],
	});
	expect(renamed.success).toBe(true);
	if (!renamed.success) throw new Error(JSON.stringify(renamed));
	const before = readArchitectureModel(vault);
	if (!before.success) throw new Error(JSON.stringify(before));
	expect(before.collections[0]).toMatchObject({
		id: "Behavior",
		name: "Exchanges",
		formerNames: ["Behavior"],
	});
	const next = await structureIntent(vault, allBehaviorSubjects);
	const renamedAgain = await editArchitectureModule(vault, {
		...next,
		changes: [{ type: "edit-collection", collection: "Behavior", name: "Messages" }],
	});
	expect(renamedAgain.success).toBe(true);
	const after = readArchitectureModel(vault);
	if (!after.success) throw new Error(JSON.stringify(after));
	expect(after.collections[0]).toMatchObject({
		id: "Behavior",
		name: "Messages",
		formerNames: ["Behavior", "Exchanges"],
	});
	const retained = await readArchitectureCheckpoint(vault, renamed.checkpoint.id);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(retained.collections).toEqual(before.collections);
});

test("an unrelated proposal inherits a collection's former names", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Description", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Accept requests." } },
	]);
	const renamed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "edit-collection", collection: "Behavior", name: "Exchanges" }],
	});
	expect(renamed).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.collections[0]).toMatchObject({
		id: "Behavior",
		name: "Exchanges",
		formerNames: ["Behavior"],
	});
});
