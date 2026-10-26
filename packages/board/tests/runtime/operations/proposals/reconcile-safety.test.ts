import { behaviorFixture } from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureClaims } from "@archboard/board/store-read";
import {
	editArchitectureModule,
	claimArchitectureSubjects,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, selected, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
afterEach(disposeFixtures);
test("the writer refuses an incomplete descendant claim without installing any part of the family", async () => {
	const { vault } = fixture();
	const draft = await proposal(vault, "Queued");
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const claims = readArchitectureClaims(vault);
	if (!claims.success) throw new Error(JSON.stringify(claims));
	for (const claim of claims.claims)
		await releaseArchitectureClaim(vault, { claim: claim.id, writer: claim.writer });
	const target = { model: "Shop", state: "Current" };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "incomplete scope",
		subjects: ["Shop#Gateway"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const result = await editArchitectureModule(vault, {
		target,
		writer: "agent",
		claim: claim.claim.id,
		expectedRevision: current.revision,
		operationId: "missing-descendant",
		doing: "changing predecessor",
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "New current description." },
			},
		],
	});
	expect(result).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
		applied: false,
		diagnostics: expect.arrayContaining([
			expect.objectContaining({ subjects: expect.arrayContaining([draft.target.state]) }),
		]),
	});
	expect(readArchitectureModel(vault)).toMatchObject({ success: true, revision: current.revision });
});
test("deliberate reconciliation follows external predecessor edits without hiding their initial refusal", async () => {
	const { vault } = behaviorFixture();
	const draft = await proposal(vault, "Queued", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
	]);
	const path = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(path, "utf8"));
	gateway.responsibility = "External predecessor";
	writeFileSync(path, JSON.stringify(gateway));
	renameSync(path, join(vault, "relocated.module.json"));
	renameSync(join(vault, "unrelated-name.flows.json"), join(vault, "relocated.flows.json"));
	expect(
		await readArchitectureModel(vault, undefined, undefined, { state: draft.target.state! }),
	).toMatchObject({ success: false, code: "PREDECESSOR_CHANGED" });
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		proposal: { type: "reconcile" },
		changes: [],
	});
	expect(result).toMatchObject({ success: true, reconciliation: false });
	const reading = await selected(vault, draft.target.state!);
	expect(reading.modules.find((module) => module.id === "Shop#Gateway")).toMatchObject({
		id: "Shop#Gateway",
		description: "Queues work.",
		responsibility: "External predecessor",
		file: "relocated.module.json",
	});
	expect(reading.collections[0]?.file).toBe("relocated.flows.json");
});

test("a proposal-only relationship keeps its removed source readable while unrelated predecessor fields inherit", async () => {
	const { vault } = fixture();
	const draft = await proposal(vault, "Worker callback", "Current", [
		{
			type: "add-relationship",
			source: "Shop#Worker",
			relationship: {
				to: "Shop#Gateway",
				kind: "call",
				order: 20,
				label: "Callback",
				emphasis: "normal",
			},
		},
	]);
	const result = await editArchitectureModule(vault, {
		...(await request(vault)),
		changes: [
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "edit-module", subject: "Shop#Handler", clear: ["parent"] },
			{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Public gateway" } },
		],
	});
	expect(result).toMatchObject({ success: true, reconciliation: true });
	const held = await selected(vault, draft.target.state!);
	expect(held.selectedState?.standing?.issues).toEqual(
		expect.arrayContaining([expect.objectContaining({ kind: "reference-lost" })]),
	);
	expect(held.relationships).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				from: "Shop#Worker",
				to: "Shop#Gateway",
				label: "Callback",
				emphasis: "normal",
			}),
		]),
	);
	expect(held.modules.find((m) => m.id === "Shop#Gateway")?.name).toBe("Public gateway");
});
