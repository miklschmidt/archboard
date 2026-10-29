import { beforeAll, afterAll, expect, test } from "bun:test";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { fixture } from "#tests/runtime/operations/model-edit/fixture.ts";
import { proposal, request, selected } from "#tests/runtime/operations/proposals/fixture.ts";
import {
	destination,
	empty,
	cleanPortableFixtures,
} from "#tests/runtime/operations/history/portable-fixture.ts";
async function standingFixture() {
	const source = fixture();
	const first = await proposal(source.vault, "Queued", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
	]);
	const child = await proposal(source.vault, "Batch", first.target.state!);
	const advance = await editArchitectureModule(source.vault, {
		...(await request(source.vault)),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Dispatches immediately." },
			},
		],
	});
	if (!advance.success) throw new Error(JSON.stringify(advance));
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	return { source, first, child, current };
}
let evidence: Awaited<ReturnType<typeof standingFixture>> | undefined;
beforeAll(async () => {
	evidence = await standingFixture();
}, 15000);
afterAll(cleanPortableFixtures);
test("portable active proposals keep standing baselines and blocked descendants", async () => {
	if (evidence === undefined) throw new Error("The standing fixture is unavailable.");
	const { source, first, child, current } = evidence;
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const imported = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "standing-import",
		writer: "agent",
		doing: "restoring standing proposals",
	});
	if (!imported.success) throw new Error(JSON.stringify(imported));
	const catalogue = readArchitectureModel(target.vault);
	expect(catalogue.success && catalogue.proposals).toEqual(current.proposals);
	const held = await selected(target.vault, first.target.state!);
	expect(held.selectedState?.standing?.issues.length).toBeGreaterThan(0);
	expect(held.modules.find((m) => m.id === "Shop#Gateway")?.description).toBe("Queues work.");
	expect(
		await readArchitectureModel(target.vault, undefined, undefined, {
			state: child.target.state!,
			compare: false,
		}),
	).toMatchObject({
		success: true,
		selectedState: { standing: { blockedBy: first.target.state } },
	});
	const baseline = current.proposals.find((p) => p.id === first.target.state)!.baseline;
	expect(await readArchitectureCheckpoint(target.vault, baseline)).toMatchObject({ success: true });
}, 15000);
