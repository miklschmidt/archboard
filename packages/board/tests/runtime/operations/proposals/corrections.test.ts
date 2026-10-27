import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	readArchitectureCheckpoint,
	readArchitectureModel,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(disposeFixtures);

test("a shelved correction follows lasting identity while original checkpoints and current files stay exact", async () => {
	const { root, vault } = fixture();
	const created = await proposal(vault, "Alternate route", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Incorrect account." } },
	]);
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, created.target.state!)),
		proposal: { type: "shelve", reason: "Keep this alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const original = await selected(vault, created.target.state!);
	const currentBytes = readFileSync(join(vault, "gateway.module.json"));
	const manifestBytes = readFileSync(join(vault, "model.json"));
	const intent = {
		...(await request(vault, created.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "The source already routes authenticated requests.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		},
		changes: [
			{
				type: "edit-module" as const,
				subject: "Shop#Gateway",
				set: { description: "Routes authenticated requests." },
			},
		],
	};
	const corrected = await editArchitectureModule(vault, intent);
	expect(corrected).toMatchObject({
		success: true,
		selectedState: { id: created.target.state, lifecycle: "shelved", name: "Alternate route" },
		checkpoint: { correction: intent.correction },
	});
	if (!corrected.success) throw new Error(JSON.stringify(corrected));
	const logical = await selected(vault, "Alternate route");
	expect(logical.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Routes authenticated requests.",
	);
	expect(logical.selectedState).toMatchObject({
		...original.selectedState,
		corrections: [
			{ checkpoint: corrected.checkpoint.id, ...intent.correction },
		],
	});
	const exact = await readArchitectureCheckpoint(vault, shelved.checkpoint.id, undefined, undefined, {
		compare: false,
	});
	expect(exact).toMatchObject({ success: true, modules: original.modules });
	const compared = await readArchitectureModel(vault, undefined, undefined, {
		state: created.target.state!,
		against: shelved.checkpoint.id,
	});
	if (!compared.success) throw new Error(JSON.stringify(compared));
	expect(compared.comparison).toMatchObject({
		corrections: { selected: logical.selectedState!.corrections, against: [] },
		subjects: expect.arrayContaining([
			{ id: "Shop#Gateway", subjectKind: "module", kind: "changed", fields: expect.any(Array) },
		]),
	});
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(currentBytes);
	expect(readFileSync(join(vault, "model.json"))).toEqual(manifestBytes);
	expect(await editArchitectureModule(vault, intent)).toEqual(corrected);
	const history = await listArchitectureCheckpoints(vault);
	if (!history.success) throw new Error(JSON.stringify(history));
	expect(history.checkpoints.filter((checkpoint) => checkpoint.correction !== undefined)).toHaveLength(1);
	expect(git(root, "merge-base", "--is-ancestor", shelved.checkpoint.id, corrected.checkpoint.id)).toBe("");
}, 20_000);

test("a historical correction reconciles following drafts and stops at adopted successors", async () => {
	const { root, vault } = fixture();
	const successor = await proposal(vault, "Implemented successor", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Implemented gateway" } },
	]);
	const adopted = await editArchitectureModule(vault, {
		...(await request(vault, successor.target.state!)),
		proposal: { type: "adopt", reason: "The successor is implemented." },
		changes: [],
	});
	if (!adopted.success) throw new Error(JSON.stringify(adopted));
	const following = await proposal(vault, "Historical follow-up", "Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { responsibility: "Keeps its own plan." } },
	]);
	const before = await selected(vault, "Current");
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const changed = await editArchitectureModule(vault, {
		...(await request(vault)),
		correction: {
			previous: before.checkpoint!.id,
			reason: "The original gateway already described this routing.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		},
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Correct original routing." } }],
	});
	expect(changed).toMatchObject({ success: true, reconciliation: false });
	if (!changed.success) throw new Error(JSON.stringify(changed));
	const draft = await selected(vault, following.target.state!);
	expect(draft.modules.find((module) => module.id === "Shop#Gateway")).toMatchObject({
		description: "Correct original routing.",
		responsibility: "Keeps its own plan.",
	});
	const now = readArchitectureModel(vault);
	if (!now.success) throw new Error(JSON.stringify(now));
	expect(now.modules).toEqual(current.modules);
	expect(now.manifest).toEqual(current.manifest);
	expect((await selected(vault, successor.target.state!)).modules).toEqual(current.modules);
	expect(git(root, "merge-base", "--is-ancestor", before.checkpoint!.id, changed.checkpoint.id)).toBe("");
}, 25_000);
