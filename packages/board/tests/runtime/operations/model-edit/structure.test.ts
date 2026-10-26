import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/board/store-write";
import {
	fixture,
	disposeFixtures,
	structureIntent as batch,
} from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("a module rename preserves its identity, former names and every unrelated file", async () => {
	const { vault } = fixture();
	const input = await batch(vault, ["Shop#Gateway"]);
	const worker = readFileSync(join(vault, "worker.module.json"));
	const result = await editArchitectureModule(vault, {
		...input,
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { name: "API", responsibility: "Routes requests" },
			},
		],
	});
	expect(result).toMatchObject({ success: true, subjects: ["Shop#Gateway"] });
	const reading = readArchitectureModel(vault, "Gateway");
	expect(reading).toMatchObject({
		success: true,
		selectedModule: "Shop#Gateway",
		modules: expect.arrayContaining([
			expect.objectContaining({
				id: "Shop#Gateway",
				name: "API",
				formerNames: ["Public API", "Gateway"],
				responsibility: "Routes requests",
			}),
		]),
	});
	expect(readFileSync(join(vault, "worker.module.json"))).toEqual(worker);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Gateway",
					set: { name: "API", responsibility: "Routes requests" },
				},
			],
		}),
	).toEqual(result);
});

test("adding a module mints one identity and a root file without changing existing definitions", async () => {
	const { vault } = fixture();
	const input = await batch(vault, ["Shop"]);
	const gateway = readFileSync(join(vault, "gateway.module.json"));
	const result = await editArchitectureModule(vault, {
		...input,
		changes: [{ type: "add-module", module: { name: "Cache", kind: "service", order: 5 } }],
	});
	expect(result).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault, "Cache");
	if (!reading.success) throw new Error(JSON.stringify(reading));
	const added = reading.modules.find((module) => module.id === reading.selectedModule)!;
	expect(added.id).toMatch(/^Shop#[A-Za-z0-9]{8}$/u);
	expect(added).toMatchObject({ name: "Cache", order: 5, outgoing: [] });
	expect(reading.roots[0]).toBe(added.id);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(gateway);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "add-module", module: { name: "Cache", kind: "service", order: 5 } }],
		}),
	).toEqual(result);
});

test("reparenting requires both containment scopes and refuses a cycle without changing the model", async () => {
	const { vault } = fixture();
	let input = await batch(vault, ["Shop#Gateway"]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "edit-module", subject: "Gateway", set: { parent: "Shop#Worker" } }],
		}),
	).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
		diagnostics: expect.arrayContaining([
			expect.objectContaining({ subjects: expect.arrayContaining(["Shop#Worker"]) }),
		]),
	});
	const { releaseArchitectureClaim } = await import("@archboard/board/store-write");
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	input = await batch(vault, ["Shop#Gateway", "Shop#Worker", "Shop#Handler"]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "edit-module", subject: "Gateway", set: { parent: "Worker" } }],
		}),
	).toMatchObject({ success: true });
	const parented = readArchitectureModel(vault);
	expect(parented).toMatchObject({
		success: true,
		roots: ["Shop#Worker"],
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", parent: "Shop#Worker" }),
		]),
	});
	input = await batch(vault, ["Shop#Gateway", "Shop#Worker", "Shop#Handler"]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "edit-module", subject: "Shop#Worker", set: { parent: "Shop#Gateway" } }],
		}),
	).toMatchObject({
		success: false,
		code: "MODEL_INVALID",
		diagnostics: expect.arrayContaining([expect.objectContaining({ code: "CONTAINMENT_CYCLE" })]),
	});
	expect(readArchitectureModel(vault)).toEqual(parented);
	expect(
		await editArchitectureModule(vault, {
			...input,
			operationId: crypto.randomUUID(),
			changes: [{ type: "edit-module", subject: "Shop#Gateway", clear: ["parent"] }],
		}),
	).toMatchObject({ success: true });
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		roots: ["Shop#Worker", "Shop#Gateway"],
	});
});

test("a relationship source transfer preserves identity and metadata across files and retains one outcome", async () => {
	const { vault } = fixture();
	const before = readArchitectureModel(vault);
	if (!before.success) throw new Error(JSON.stringify(before));
	const edge = before.relationships.find((value) => value.id === "Shop#Dispatch")!;
	const untouched = readFileSync(join(vault, "internal/handler.module.json"));
	const input = await batch(vault, ["Shop#Gateway", "Shop#Worker", "Shop#Dispatch"]);
	const changes = [
		{
			type: "edit-relationship" as const,
			subject: "Shop#Dispatch",
			source: "Shop#Worker",
			set: { to: "Shop#Gateway" },
		},
	];
	const result = await editArchitectureModule(vault, { ...input, changes });
	expect(result).toMatchObject({
		success: true,
		subjects: expect.arrayContaining(["Shop#Dispatch", "Shop#Gateway", "Shop#Worker"]),
	});
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		relationships: [{ ...edge, from: "Shop#Worker", to: "Shop#Gateway" }],
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", outgoing: [] }),
		]),
	});
	expect(readFileSync(join(vault, "internal/handler.module.json"))).toEqual(untouched);
	expect(await editArchitectureModule(vault, { ...input, changes })).toEqual(result);
	if (!result.success) throw new Error(JSON.stringify(result));
	const { readArchitectureCheckpoint } = await import("@archboard/board/store-read");
	expect(await readArchitectureCheckpoint(vault, result.checkpoint.id)).toMatchObject({
		success: true,
		relationships: [{ ...edge, from: "Shop#Worker", to: "Shop#Gateway" }],
	});
});

test("relationship additions, field edits and removals preserve order and reserve retired identities", async () => {
	const { vault } = fixture();
	let input = await batch(vault, ["Shop", "Shop#Worker", "Shop#Gateway"]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [
				{
					type: "add-relationship",
					source: "Shop#Worker",
					relationship: { to: "Public API", kind: "call", order: 4, label: "Notify" },
				},
			],
		}),
	).toMatchObject({ success: true });
	let current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const edge = current.relationships.find((value) => value.from === "Shop#Worker")!;
	expect(edge).toMatchObject({ to: "Shop#Gateway", order: 4, label: "Notify" });
	const { releaseArchitectureClaim } = await import("@archboard/board/store-write");
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	input = await batch(vault, ["Shop", "Shop#Worker", "Shop#Gateway", edge.id]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [
				{
					type: "edit-relationship",
					subject: edge.id,
					set: { description: "Emits a notification", order: 1 },
					clear: ["label"],
				},
			],
		}),
	).toMatchObject({ success: true });
	current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.relationships.find((value) => value.id === edge.id)).toEqual({
		id: edge.id,
		from: "Shop#Worker",
		to: "Shop#Gateway",
		kind: "call",
		emphasis: "normal",
		order: 1,
		description: "Emits a notification",
	});
	input = await batch(vault, ["Shop", "Shop#Worker", "Shop#Gateway", edge.id]);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "remove-relationship", subject: edge.id }],
		}),
	).toMatchObject({ success: true });
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		manifest: { retiredIds: expect.arrayContaining([edge.id]) },
		relationships: [expect.objectContaining({ id: "Shop#Dispatch" })],
	});
});

test("module deletion repairs incident references, retires identities and leaves unrelated bytes exact", async () => {
	const { vault } = fixture();
	const input = await batch(vault, ["Shop", "Shop#Gateway", "Shop#Worker", "Shop#Dispatch"]);
	const untouched = readFileSync(join(vault, "internal/handler.module.json"));
	const result = await editArchitectureModule(vault, {
		...input,
		changes: [{ type: "remove-module", subject: "Shop#Worker" }],
	});
	expect(result).toMatchObject({
		success: true,
		subjects: expect.arrayContaining(["Shop#Worker", "Shop#Gateway", "Shop#Dispatch"]),
	});
	const current = readArchitectureModel(vault);
	expect(current).toMatchObject({
		success: true,
		roots: ["Shop#Gateway"],
		relationships: [],
		manifest: { retiredIds: expect.arrayContaining(["Shop#Worker", "Shop#Dispatch"]) },
	});
	expect(readArchitectureModel(vault, "Shop#Worker")).toMatchObject({
		success: false,
		code: "MODULE_NOT_FOUND",
	});
	expect(readFileSync(join(vault, "internal/handler.module.json"))).toEqual(untouched);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "remove-module", subject: "Shop#Worker" }],
		}),
	).toEqual(result);
});

test("one batch removes a container, reparents its child and rescues its relationship in any statement order", async () => {
	const { vault } = fixture();
	const input = await batch(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Worker",
		"Shop#Handler",
		"Shop#Dispatch",
	]);
	const original = readArchitectureModel(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "remove-module", subject: "Shop#Gateway" }],
		}),
	).toMatchObject({
		success: false,
		diagnostics: expect.arrayContaining([expect.objectContaining({ code: "NODE_HAS_CHILDREN" })]),
	});
	expect(readArchitectureModel(vault)).toEqual(original);
	const result = await editArchitectureModule(vault, {
		...input,
		operationId: crypto.randomUUID(),
		changes: [
			{ type: "remove-module", subject: "Shop#Gateway" },
			{ type: "edit-relationship", subject: "Shop#Dispatch", source: "Shop#Handler" },
			{ type: "edit-module", subject: "Shop#Handler", set: { parent: "Shop#Worker" } },
		],
	});
	expect(result).toMatchObject({ success: true });
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		roots: ["Shop#Worker"],
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Handler", parent: "Shop#Worker" }),
		]),
		relationships: [
			expect.objectContaining({
				id: "Shop#Dispatch",
				from: "Shop#Handler",
				to: "Shop#Worker",
				emphasis: "hero",
			}),
		],
		manifest: { retiredIds: expect.arrayContaining(["Shop#Gateway"]) },
	});
});

test("an affected competing claim refuses a transfer while unrelated scopes remain usable", async () => {
	const { vault } = fixture();
	const input = await batch(vault, ["Shop#Gateway"]);
	const other = await claimArchitectureSubjects(vault, {
		target: input.target,
		writer: "other",
		reason: "changing the worker",
		subjects: ["Shop#Worker"],
	});
	expect(other).toMatchObject({ success: true });
	const before = readArchitectureModel(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "edit-relationship", subject: "Shop#Dispatch", source: "Shop#Worker" }],
		}),
	).toMatchObject({ success: false, code: "CLAIM_HELD" });
	expect(readArchitectureModel(vault)).toEqual(before);
	const unrelated = await claimArchitectureSubjects(vault, {
		target: input.target,
		writer: "third",
		reason: "explaining the handler",
		subjects: ["Shop#Handler"],
	});
	if (!unrelated.success) throw new Error(JSON.stringify(unrelated));
	expect(
		await editArchitectureModule(vault, {
			...input,
			claim: unrelated.claim.id,
			writer: "third",
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Handler",
					set: { description: "Handles the request" },
				},
			],
		}),
	).toMatchObject({ success: true, subjects: ["Shop#Handler"] });
});

test("a batch can reference its new module before its addition without exposing caller-chosen identities", async () => {
	const { vault } = fixture();
	const input = await batch(vault, ["Shop", "Shop#Gateway", "Shop#Handler"]);
	const result = await editArchitectureModule(vault, {
		...input,
		changes: [
			{
				type: "add-relationship",
				source: "Shop#Handler",
				relationship: { to: "Cache", kind: "call", order: 3 },
			},
			{ type: "edit-module", subject: "Shop#Handler", set: { parent: "Cache" } },
			{ type: "add-module", module: { name: "Cache", kind: "service", order: 5 } },
		],
	});
	expect(result).toMatchObject({ success: true });
	const current = readArchitectureModel(vault, "Cache");
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current).toMatchObject({
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Handler", parent: current.selectedModule }),
		]),
		relationships: expect.arrayContaining([
			expect.objectContaining({ from: "Shop#Handler", to: current.selectedModule }),
		]),
	});
});
