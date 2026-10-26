import { afterEach, expect, test } from "bun:test";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
afterEach(disposeFixtures);
test("settlement keeps a changed subject after predecessor deletion without replacing its identity", async () => {
	const { vault } = fixture();
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
	expect(
		(await selected(vault, draft.target.state!)).modules.find((m) => m.id === "Shop#Worker")
			?.description,
	).toBe("Retries queued work.");
});
