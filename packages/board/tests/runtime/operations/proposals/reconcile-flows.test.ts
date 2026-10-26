import { afterEach, expect, test } from "bun:test";
import { editArchitectureModule } from "@archboard/board/store-write";
import { behaviorFixture } from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import { disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
afterEach(disposeFixtures);
test("alternative renames and independent step fields inherit without false order conflicts", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Documented", "Current", [
		{ type: "edit-step", subject: "Shop#Result", set: { note: "Keep the result" } },
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "edit-step", subject: "Shop#Decide", set: { alternatives: ["accepted", "no"] } },
			{
				type: "move-step",
				subject: "Shop#Repeat",
				placement: { holder: "Shop#Decide", alternative: "accepted" },
			},
			{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Public gateway" } },
		],
	});
	expect(result).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.collections[0]!.flows[0]!.steps[1]).toMatchObject({
		id: "Shop#Decide",
		alternatives: [
			{
				label: "accepted",
				steps: [{ id: "Shop#Repeat", steps: [{ id: "Shop#Result", note: "Keep the result" }] }],
			},
			{ label: "no", steps: [] },
		],
	});
});
test("competing step holders remain explicit and take-theirs settlement preserves the renamed alternative", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Other answer", "Current", [
		{
			type: "move-step",
			subject: "Shop#Repeat",
			placement: { holder: "Shop#Decide", alternative: "no" },
		},
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "edit-step", subject: "Shop#Decide", set: { alternatives: ["accepted", "no"] } },
			{
				type: "move-step",
				subject: "Shop#Repeat",
				placement: { holder: "Shop#Decide", alternative: "accepted" },
			},
		],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const held = await selected(vault, draft.target.state!);
	expect(held.selectedState?.standing?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: "Shop#Repeat", field: "within", kind: "competing-field" }),
		]),
	);
	const settled = await editArchitectureModule(vault, {
		...(await request(vault, draft.target.state!)),
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop#Repeat", field: "within", take: "theirs" }],
		},
		changes: [],
	});
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.collections[0]!.flows[0]!.steps[1]).toMatchObject({
		alternatives: [
			{ label: "accepted", steps: [{ id: "Shop#Repeat" }] },
			{ label: "no", steps: [] },
		],
	});
});
test("different step deletions keep an emptied flow coherent until its holder is explicitly settled", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Keep decision", "Current", [
		{ type: "remove-step", subject: "Shop#Send" },
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [{ type: "remove-step", subject: "Shop#Decide" }],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const held = await selected(vault, draft.target.state!);
	expect(held.selectedState?.standing?.issues).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ subject: "Shop#Checkout", kind: "left-empty" }),
		]),
	);
	expect(held.collections[0]!.flows[0]!.steps).toMatchObject([{ id: "Shop#Decide" }]);
});

test("a step moved to another flow inherits an independent predecessor field by its continuing identity", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Move dispatch", "Current", [
		{
			type: "move-step",
			subject: "Shop#Send",
			placement: { holder: "Shop#Other", before: "Shop#Notify" },
		},
	]);
	const changed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "edit-step", subject: "Shop#Send", set: { label: "Dispatch accepted work" } },
		],
	});
	expect(changed).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.collections[0]!.flows[1]!.steps[0]).toMatchObject({
		id: "Shop#Send",
		label: "Dispatch accepted work",
	});
	expect(reading.collections[0]!.flows[0]!.steps[0]).toMatchObject({ id: "Shop#Decide" });
});

test("incompatible flow and nested-holder moves keep the complete proposal side", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Nested dispatch", "Current", [
		{
			type: "move-step",
			subject: "Shop#Send",
			placement: { holder: "Shop#Decide", alternative: "no" },
		},
	]);
	const changed = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{
				type: "move-step",
				subject: "Shop#Send",
				placement: { holder: "Shop#Other", before: "Shop#Notify" },
			},
		],
	});
	expect(changed).toMatchObject({ success: true, reconciliation: true });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.collections[0]!.flows[0]!.steps[0]).toMatchObject({
		id: "Shop#Decide",
		alternatives: [{ label: "yes" }, { label: "no", steps: [{ id: "Shop#Send" }] }],
	});
	expect(reading.collections[0]!.flows[1]!.steps).toMatchObject([{ id: "Shop#Notify" }]);
});
