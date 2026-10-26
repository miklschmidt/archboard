import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	editArchitectureModule,
	releaseArchitectureClaim,
	claimArchitectureSubjects,
} from "@archboard/board/store-write";
import {
	behaviorFixture,
	allBehaviorSubjects,
} from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import {
	fixture,
	structureIntent,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("draft metadata and nested moves retain identity and compare against a named sibling", async () => {
	const { vault } = behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const created = await editArchitectureModule(vault, {
		...input,
		proposal: {
			type: "create",
			name: "First",
			summary: "Initial draft",
			documents: [{ repo: "github.com/acme/shop", path: "docs/plan.md" }],
		},
		changes: [],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	const selected = await readArchitectureModel(vault, undefined, undefined, { state: "First" });
	if (!selected.success || selected.selectedState === null)
		throw new Error(JSON.stringify(selected));
	const target = { model: "Shop", state: selected.selectedState.id };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "editing a draft",
		subjects: [...allBehaviorSubjects, target.state],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const edited = await editArchitectureModule(vault, {
		...input,
		target,
		expectedRevision: selected.revision,
		operationId: "move-in-draft",
		claim: claim.claim.id,
		proposal: { type: "edit", set: { name: "Renamed" }, clear: ["summary"] },
		changes: [
			{ type: "edit-step", subject: "Shop#Decide", set: { alternatives: ["accepted", "no"] } },
			{
				type: "move-step",
				subject: "Shop#Repeat",
				placement: { holder: "Shop#Decide", alternative: "accepted" },
			},
			{
				type: "move-step",
				subject: "Shop#Send",
				placement: { holder: "Shop#Other", before: "Shop#Notify" },
			},
		],
	});
	expect(edited).toMatchObject({
		success: true,
		target,
		selectedState: {
			id: target.state,
			name: "Renamed",
			formerNames: ["First"],
			documents: [{ repo: "github.com/acme/shop", path: "docs/plan.md" }],
		},
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	const reading = await readArchitectureModel(vault, undefined, undefined, { state: "First" });
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.selectedState).not.toHaveProperty("summary");
	expect(reading.proposals[0]!.baseline).toBe(selected.proposals[0]!.baseline);
	expect(reading.collections[0]!.flows[0]!.steps[0]).toMatchObject({
		id: "Shop#Decide",
		alternatives: [
			{ label: "accepted", steps: [{ id: "Shop#Repeat" }] },
			{ label: "no", steps: [] },
		],
	});
	expect(reading.collections[0]!.flows[1]!.steps.map((s) => s.id)).toEqual([
		"Shop#Send",
		"Shop#Notify",
	]);
	expect(reading.comparison?.subjects.find((s) => s.id === "Shop#Send")).toMatchObject({
		kind: "changed",
		subjectKind: "step",
	});
	expect(await readArchitectureCheckpoint(vault, edited.checkpoint.id)).toMatchObject({
		success: true,
		selectedState: { id: target.state, lifecycle: "draft" },
		collections: reading.collections,
	});
	const stored = JSON.parse(readFileSync(join(vault, reading.proposals[0]!.file), "utf8"));
	expect(stored.changes.some((c: { type: string }) => c.type === "place")).toBe(true);
	expect(JSON.stringify(stored)).not.toContain("Keep me");
}, 20_000);

test("planning roots and named predecessors keep additions out of current and use retained predecessor comparisons", async () => {
	const { vault } = fixture();
	const manifest = JSON.parse(readFileSync(join(vault, "model.json"), "utf8"));
	const initial = readArchitectureModel(vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	for (const module of initial.modules) rmSync(join(vault, module.file));
	manifest.current = null;
	writeFileSync(join(vault, "model.json"), JSON.stringify(manifest));

	const raw = readArchitectureModel(vault);
	if (!raw.success) throw new Error(JSON.stringify(raw));
	const target = { model: "Shop", state: null };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "planning the first model",
		subjects: ["Shop"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const request = {
		target,
		writer: "agent",
		claim: claimed.claim.id,
		operationId: "plan-root",
		doing: "planning unbuilt modules",
		expectedRevision: raw.revision,
		proposal: { type: "create" as const, name: "Plan" },
		changes: [
			{ type: "add-module" as const, module: { name: "Future API", kind: "service", order: 10 } },
		],
	};
	const created = await editArchitectureModule(vault, request);
	expect(created).toMatchObject({ success: true });
	if (!created.success) throw new Error(JSON.stringify(created));
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		modules: [],
		manifest: { current: null },
		selectedState: null,
	});
	const plan = await readArchitectureModel(vault, undefined, undefined, {
		state: "Plan",
		against: created.checkpoint.request.dependencies[0],
	});
	if (!plan.success || !plan.selectedState) throw new Error(JSON.stringify(plan));
	expect(plan.modules.map((m) => m.name)).toEqual(["Future API"]);
	expect(plan.comparison).toMatchObject({
		reason: "explicit",
		against: null,
		subjects: expect.arrayContaining([
			expect.objectContaining({ kind: "added", subjectKind: "module" }),
		]),
	});
	await releaseArchitectureClaim(vault, { claim: request.claim, writer: "agent" });
	const childTarget = { model: "Shop", state: plan.selectedState.id };
	const claim = await claimArchitectureSubjects(vault, {
		target: childTarget,
		writer: "agent",
		reason: "planning the next stage",
		subjects: ["Shop", plan.modules[0]!.id],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const child = await editArchitectureModule(vault, {
		...request,
		target: childTarget,
		claim: claim.claim.id,
		operationId: "plan-child",
		expectedRevision: plan.revision,
		proposal: { type: "create", name: "Next" },
		changes: [
			{
				type: "edit-module",
				subject: plan.modules[0]!.id,
				set: { description: "Accepts requests." },
			},
		],
	});
	expect(child).toMatchObject({ success: true });
	const next = await readArchitectureModel(vault, undefined, undefined, { state: "Next" });
	expect(next).toMatchObject({
		success: true,
		selectedState: { lifecycle: "draft", predecessor: plan.selectedState.id },
		comparison: { reason: "predecessor", against: { id: plan.selectedState.id } },
	});
	if (!next.success) throw new Error(JSON.stringify(next));
	const against = await readArchitectureModel(vault, undefined, undefined, {
		state: "Next",
		against: "Plan",
	});
	expect(against).toMatchObject({
		success: true,
		comparison: { reason: "explicit", against: { id: plan.selectedState.id } },
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, { state: "current" }),
	).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
}, 20_000);
