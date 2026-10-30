import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { behaviorFixture } from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("an empty collection does not block safe inheritance through a proposal", async () => {
	const { vault } = fixture();
	writeFileSync(
		join(vault, "empty.flows.json"),
		JSON.stringify({ schemaVersion: 1, id: "Empty", name: "Empty", flows: [] }),
	);
	const draft = await proposal(vault, "Documented API", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues requests." } },
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Public API" } }],
	});
	expect(result).toMatchObject({ success: true, reconciliation: false });
	const following = await selected(vault, draft.target.state!);
	expect(following.collections.find((collection) => collection.id === "Empty")?.flows).toEqual([]);
	expect(following.modules.find((module) => module.id === "Shop#Gateway")).toMatchObject({
		name: "Public API",
		description: "Queues requests.",
	});
});

test("a changed collection keeps its identity when its predecessor removes it", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Named behavior", "Current", [
		{ type: "edit-collection", collection: "Behavior", name: "Documented behavior" },
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "remove-collection", collection: "Behavior" }],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const following = await selected(vault, draft.target.state!);
	expect(following.collections).toEqual([
		expect.objectContaining({ id: "Behavior", name: "Documented behavior" }),
	]);
	expect(following.selectedState?.standing?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: "Shop#Behavior", kind: "deleted-and-changed" }),
		]),
	);
});
