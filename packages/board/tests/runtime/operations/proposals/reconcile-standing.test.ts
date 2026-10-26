import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
afterEach(disposeFixtures);
test("incomplete settlement refuses and ordinary edits retain every standing issue", async () => {
	const { vault } = fixture();
	const draft = await proposal(vault, "Queued", "Current", [
		{
			type: "edit-module",
			subject: "Shop#Gateway",
			set: { description: "Queues work.", responsibility: "Queues requests" },
		},
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Dispatches immediately.", responsibility: "Dispatches requests" },
			},
		],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const revision = readArchitectureModel(vault);
	if (!revision.success) throw new Error(JSON.stringify(revision));
	const partial = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!)),
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop#Gateway", field: "description", take: "mine" }],
		},
		changes: [],
	});
	expect(partial).toMatchObject({ success: false, code: "MODEL_INVALID", applied: false });
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		revision: revision.revision,
	});
	const edited = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!)),
		proposal: { type: "edit" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Third answer." } },
		],
	});
	expect(edited).toMatchObject({ success: true, reconciliation: true });
	const held = await selected(vault, draft.target.state!);
	expect(held.selectedState?.standing?.issues).toHaveLength(2);
	expect(held.modules.find((m) => m.id === "Shop#Gateway")?.description).toBe("Third answer.");
});
test("independent arrivals keep stable identities and avoid automatically assigned order conflicts", async () => {
	const { vault } = fixture();
	const draft = await proposal(vault, "Cache", "Current", [
		{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } },
	]);
	const own = (await selected(vault, draft.target.state!)).modules.find((m) => m.name === "Cache")!;
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "add-module", module: { name: "Queue", kind: "service", order: 40 } }],
	});
	expect(result).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.modules.find((m) => m.id === own.id)).toMatchObject({ name: "Cache", order: 40 });
	const queue = reading.modules.find((m) => m.name === "Queue")!;
	expect(queue.order).toBeGreaterThan(own.order);
	expect(reading.selectedState).not.toHaveProperty("standing");
});
