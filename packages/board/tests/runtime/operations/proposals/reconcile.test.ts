import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("a predecessor edit publishes safe inherited fields through the complete dependent family", async () => {
	const { vault } = fixture();
	const first = await proposal(vault, "Queued", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
	]);
	const child = await proposal(vault, "Batched", first.target.state!, [
		{
			type: "edit-module",
			subject: "Shop#Gateway",
			set: { responsibility: "Batches queued work" },
		},
	]);
	const edited = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Public API" } }],
	});
	expect(edited).toMatchObject({ success: true, reconciliation: false });
	const following = await selected(vault, child.target.state!);
	expect(following.modules.find((m) => m.id === "Shop#Gateway")).toMatchObject({
		name: "Public API",
		description: "Queues work.",
		responsibility: "Batches queued work",
	});
	expect(following.selectedState).not.toHaveProperty("standing");
	expect(await readArchitectureCheckpoint(vault, first.checkpoint.id)).toMatchObject({
		success: true,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", name: "Gateway" }),
		]),
	});
});

test("standing keeps the disputed baseline readable and blocks children until explicit settlement", async () => {
	const { vault } = fixture();
	const first = await proposal(vault, "Queued", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
	]);
	const child = await proposal(vault, "Batch", first.target.state!);
	const original = (await selected(vault, first.target.state!)).selectedState!.baseline;
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Dispatches immediately.", responsibility: "Accepts public work" },
			},
		],
	});
	expect(result).toMatchObject({
		success: true,
		reconciliation: true,
		reconciliations: expect.arrayContaining([
			{
				state: child.target.state,
				standing: expect.objectContaining({ blockedBy: first.target.state }),
			},
		]),
	});
	const held = await selected(vault, first.target.state!);
	expect(held.modules.find((m) => m.id === "Shop#Gateway")).toMatchObject({
		description: "Queues work.",
		responsibility: "Accepts public work",
	});
	expect(held.selectedState).toMatchObject({
		baseline: original,
		standing: {
			baseline: original,
			issues: [
				expect.objectContaining({
					subject: "Shop#Gateway",
					field: "description",
					kind: "competing-field",
					mine: "Queues work.",
					theirs: "Dispatches immediately.",
				}),
			],
		},
	});
	expect((await selected(vault, child.target.state!)).selectedState).toMatchObject({
		standing: { blockedBy: first.target.state },
	});
	expect(
		await editArchitectureModule(vault, {
			...(await request(vault, child.target.state!)),
			proposal: { type: "edit" },
			changes: [],
		}),
	).toMatchObject({ success: false, code: "PROPOSAL_BLOCKED", applied: false });
	const intent = {
		...(await request(vault, first.target.state!)),
		proposal: {
			type: "settle" as const,
			resolutions: [{ subject: "Shop#Gateway", field: "description", take: "mine" as const }],
		},
		changes: [],
	};
	const settled = await editArchitectureModule(vault, intent);
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	expect((await selected(vault, first.target.state!)).selectedState).not.toHaveProperty("standing");
	const following = await selected(vault, child.target.state!);
	expect(following.selectedState).not.toHaveProperty("standing");
	expect(following.modules.find((m) => m.id === "Shop#Gateway")).toMatchObject({
		description: "Queues work.",
		responsibility: "Accepts public work",
	});
	expect(await editArchitectureModule(vault, intent)).toEqual(settled);
});
