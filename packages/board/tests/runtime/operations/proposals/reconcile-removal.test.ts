import { afterEach, expect, test } from "bun:test";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { behaviorFixture } from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
afterEach(disposeFixtures);
test("settlement keeps a changed subject after predecessor deletion without replacing its identity", async () => {
	const { root, vault } = fixture();
	const draft = await proposal(vault, "Keep worker", "Current", [
		{ type: "edit-module", subject: "Shop#Worker", set: { description: "Retries queued work." } },
	]);
	const removed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "edit-module", subject: "Shop#Handler", clear: ["parent"] },
		],
	});
	expect(removed).toMatchObject({ success: true, reconciliation: true });
	const held = await selected(vault, draft.target.state!);
	expect(held.modules.find((m) => m.id === "Shop#Worker")?.description).toBe(
		"Retries queued work.",
	);
	expect(held.selectedState?.standing?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: "Shop#Worker", kind: "deleted-and-changed" }),
		]),
	);
	const settled = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!)),
		proposal: { type: "settle", resolutions: [{ subject: "Shop#Worker", take: "mine" }] },
		changes: [],
	});
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	git(root, "gc", "--prune=now");
	expect(
		(await selected(vault, draft.target.state!)).modules.find((m) => m.id === "Shop#Worker")
			?.description,
	).toBe("Retries queued work.");
});

test("settlement accepts a changed step deletion without leaving a missing sibling", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Questioned dispatch", "Current", [
		{ type: "edit-step", subject: "Shop#Decide", set: { question: "Dispatch now?" } },
	]);
	const removed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "remove-step", subject: "Shop#Decide" }],
	});
	expect(removed).toMatchObject({ success: true, reconciliation: true });
	const settled = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!, ["Shop#Repeat", "Shop#Result"])),
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop#Decide", take: "theirs" }],
		},
		changes: [],
	});
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	expect(
		(await selected(vault, draft.target.state!)).collections[0]!.flows[0]!.steps,
	).toMatchObject([{ id: "Shop#Send" }]);
});
