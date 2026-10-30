import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { ArchitectureModuleEditResultSchema } from "@archboard/board/model";
import { proposal, request } from "#tests/runtime/operations/proposals/fixture.ts";
import {
	fixture,
	structureIntent,
	disposeFixtures,
	git,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("recreating an ancestor module under a new identity requires confirmation", async () => {
	const { vault } = fixture();
	const binding = { repo: "github.com/acme/shop", path: "code.ts", symbol: "value" };
	const worker = JSON.parse(readFileSync(join(vault, "worker.module.json"), "utf8"));
	writeFileSync(join(vault, "worker.module.json"), JSON.stringify({ ...worker, binding }));
	const removed = await proposal(vault, "Without worker", "Current", [
		{ type: "remove-module", subject: "Shop#Worker" },
	]);
	const child = await proposal(vault, "Next proposal", removed.target.state!);
	const input = {
		...(await request(vault, child.target.state)),
		proposal: { type: "edit" as const },
		changes: [
			{ type: "add-module" as const, module: { name: "Worker", kind: "service", order: 40 } },
		],
	};
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		applied: false,
		code: "PART_RECREATED",
	});
	expect(
		await editArchitectureModule(vault, {
			...input,
			operationId: "repeated-binding",
			changes: [
				{
					type: "add-module",
					module: { name: "Background worker", kind: "service", order: 40, binding },
				},
			],
		}),
	).toMatchObject({ success: false, applied: false, code: "PART_RECREATED" });
	const confirmed = {
		...input,
		operationId: "different-worker",
		proposal: { type: "edit", confirm: ["PART_RECREATED"] },
	};
	const result = await editArchitectureModule(vault, confirmed);
	expect(result).toMatchObject({ success: true, confirmed: ["PART_RECREATED"] });
	expect(ArchitectureModuleEditResultSchema.safeParse(result).success).toBe(true);
	expect(await editArchitectureModule(vault, confirmed)).toEqual(result);
	const selected = await readArchitectureModel(vault, undefined, undefined, {
		state: child.target.state!,
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	const added = selected.modules.find((module) => module.name === "Worker");
	if (added === undefined) throw new Error("The confirmed module is missing.");
	expect(added.id).not.toBe("Shop#Worker");
});

test("removing most inherited modules requires deliberate proposal confirmation", async () => {
	const { vault } = fixture();
	writeFileSync(
		join(vault, "spare.module.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Spare",
			name: "Spare",
			kind: "service",
			order: 40,
			outgoing: [],
		}),
	);
	const created = await proposal(vault, "Redesign");
	expect(
		await editArchitectureModule(vault, {
			...(await request(vault, created.target.state)),
			proposal: { type: "edit" },
			changes: [
				{ type: "remove-module", subject: "Shop#Worker" },
				{ type: "remove-module", subject: "Shop#Spare" },
			],
		}),
	).toMatchObject({ success: true, confirmed: [] });
	const before = readArchitectureModel(vault);
	if (!before.success) throw new Error(JSON.stringify(before));
	const held = await readArchitectureModel(vault, undefined, undefined, {
		state: created.target.state!,
	});
	if (!held.success) throw new Error(JSON.stringify(held));
	const input = {
		...(await request(vault, created.target.state)),
		proposal: { type: "edit" as const },
		changes: held.modules.map((module) => ({
			type: "remove-module" as const,
			subject: module.id,
		})),
	};
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		applied: false,
		code: "INHERITANCE_DROPPED",
	});
	expect(readArchitectureModel(vault)).toMatchObject({ success: true, revision: before.revision });
	const confirmed = {
		...input,
		operationId: "confirmed-redesign",
		proposal: { type: "edit" as const, confirm: ["INHERITANCE_DROPPED"] },
	};
	const applied = await editArchitectureModule(vault, confirmed);
	expect(applied).toMatchObject({
		success: true,
		applied: true,
		confirmed: ["INHERITANCE_DROPPED"],
	});
	expect(await editArchitectureModule(vault, confirmed)).toEqual(applied);
	expect(
		await readArchitectureModel(vault, undefined, undefined, { state: created.target.state! }),
	).toMatchObject({
		success: true,
		modules: [],
	});
});

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
