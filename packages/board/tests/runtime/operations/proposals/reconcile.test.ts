import { afterEach, expect, test } from "bun:test";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	readArchitectureClaims,
} from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	releaseArchitectureClaim,
	editArchitectureModule,
} from "@archboard/board/store-write";
import type { ArchitectureModuleEdit } from "@archboard/board/model";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

async function request(vault: string, state = "Current") {
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const claims = readArchitectureClaims(vault);
	if (!claims.success) throw new Error(JSON.stringify(claims));
	for (const claim of claims.claims)
		await releaseArchitectureClaim(vault, { claim: claim.id, writer: claim.writer });
	const target = { model: model.manifest.id, state };
	const scopes = [
		model.manifest.id,
		...model.modules.map((m) => m.id),
		...model.relationships.map((e) => e.id),
		...model.proposals.map((p) => p.id),
	];
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "reconciling family",
		subjects: scopes,
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	return {
		target,
		writer: "agent",
		doing: "reconciling family",
		claim: claim.claim.id,
		operationId: crypto.randomUUID(),
		expectedRevision: model.revision,
	};
}
async function selected(vault: string, state: string) {
	const model = await readArchitectureModel(vault, undefined, undefined, { state, compare: false });
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}
async function proposal(
	vault: string,
	name: string,
	state = "Current",
	changes: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"] = [],
) {
	const result = await editArchitectureModule(vault, {
		...(await request(vault, state)),
		proposal: { type: "create", name },
		changes,
	});
	if (!result.success || result.target.state === null) throw new Error(JSON.stringify(result));
	return result;
}
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
export { request, selected, proposal };
