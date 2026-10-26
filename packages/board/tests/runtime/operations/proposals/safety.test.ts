import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import {
	fixture,
	structureIntent,
	disposeFixtures,
	git,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("an advanced predecessor blocks drafts while exact proposal checkpoints keep their original reading", async () => {
	const { root, vault } = fixture();
	const input = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const created = await editArchitectureModule(vault, {
		...input,
		proposal: { type: "create", name: "Queued" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
		],
	});
	if (!created.success || created.selectedState === undefined)
		throw new Error(JSON.stringify(created));
	const model = JSON.parse(readFileSync(join(vault, "gateway.module.json"), "utf8"));
	model.responsibility = "Changed predecessor";
	writeFileSync(join(vault, "gateway.module.json"), JSON.stringify(model));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const bytes = readFileSync(join(vault, current.proposals[0]!.file));
	expect(
		await readArchitectureModel(vault, undefined, undefined, { state: created.selectedState.id }),
	).toMatchObject({ success: false, code: "PREDECESSOR_CHANGED" });
	expect(
		await editArchitectureModule(vault, {
			...input,
			target: created.target,
			operationId: "blocked-edit",
			expectedRevision: current.revision,
			proposal: { type: "edit" },
			changes: [],
		}),
	).toMatchObject({ success: false, code: "PREDECESSOR_CHANGED", applied: false });
	expect(readFileSync(join(vault, current.proposals[0]!.file))).toEqual(bytes);
	expect(await readArchitectureCheckpoint(vault, created.checkpoint.id)).toMatchObject({
		success: true,
		selectedState: { lifecycle: "draft" },
		modules: expect.arrayContaining([
			expect.objectContaining({
				id: "Shop#Gateway",
				description: "Queues work.",
				responsibility: expect.not.stringContaining("Changed predecessor"),
			}),
		]),
	});
	git(root, "gc", "--prune=now");
	expect(await readArchitectureCheckpoint(vault, current.proposals[0]!.baseline)).toMatchObject({
		success: true,
		modules: expect.arrayContaining([expect.objectContaining({ id: "Shop#Gateway" })]),
	});
}, 15_000);

test("compact additions removals clears and containment placements preserve current files and source identity", async () => {
	const { vault } = fixture();
	const input = await structureIntent(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Worker",
		"Shop#Handler",
		"Shop#Dispatch",
	]);
	const gateway = readFileSync(join(vault, "gateway.module.json"));
	const result = await editArchitectureModule(vault, {
		...input,
		proposal: { type: "create", name: "Replace worker" },
		changes: [
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } },
			{
				type: "edit-module",
				subject: "Shop#Handler",
				set: { parent: "Cache" },
				clear: ["description"],
			},
		],
	});
	if (!result.success || result.selectedState === undefined)
		throw new Error(JSON.stringify(result));
	const selected = await readArchitectureModel(vault, undefined, undefined, {
		state: result.selectedState.id,
	});
	expect(selected).toMatchObject({ success: true });
	if (!selected.success) throw new Error(JSON.stringify(selected));
	const cache = selected.modules.find((m) => m.name === "Cache")!;
	expect(selected.modules.some((m) => m.id === "Shop#Worker")).toBe(false);
	expect(selected.modules.find((m) => m.id === "Shop#Handler")?.parent).toBe(cache.id);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(gateway);
	const kinds = new Set(selected.proposals[0]!.changes.map((c) => c.type));
	expect(kinds.has("add")).toBe(true);
	expect(kinds.has("remove")).toBe(true);
	expect(kinds.has("place")).toBe(true);
	expect(selected.comparison?.subjects.find((s) => s.id === cache.id)).toMatchObject({
		kind: "added",
	});
	expect(selected.comparison?.subjects.find((s) => s.id === "Shop#Worker")).toMatchObject({
		kind: "removed",
	});
}, 15_000);
