import {
	behaviorFixture,
	allBehaviorSubjects,
} from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import type { ArchitectureModuleEdit } from "@archboard/board/model";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import {
	fixture,
	structureIntent,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("independent collections author ordered cross-module behavior without creating relationships", async () => {
	const { vault } = fixture();
	const before = readFileSync(join(vault, "gateway.module.json"));
	const input = await structureIntent(vault, ["Shop", "Shop#Gateway", "Shop#Worker"]);
	const request = {
		...input,
		changes: [
			{ type: "add-collection", name: "Checkout behavior" },
			{
				type: "add-flow",
				collection: "Checkout behavior",
				flow: {
					name: "Checkout",
					summary: "Complete the request",
					participants: ["Shop#Worker", "Shop#Gateway"],
					steps: [
						{
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
							note: "Authenticated",
							repeat: 3,
							anchor: { repo: "github.com/acme/shop", path: "gateway.ts", symbol: "dispatch" },
						},
						{
							kind: "decision",
							question: "Ready?",
							alternatives: [
								{
									label: "yes",
									steps: [
										{
											kind: "loop",
											condition: "More items",
											steps: [
												{
													from: "Shop#Worker",
													to: "Shop#Gateway",
													kind: "return",
													label: "Result",
												},
											],
										},
									],
								},
								{ label: "no", steps: [] },
							],
						},
					],
				},
			},
		],
	} satisfies ArchitectureModuleEdit;
	const result = await editArchitectureModule(vault, request);
	expect(result).toMatchObject({ success: true });
	if (!result.success) throw new Error(JSON.stringify(result));
	const reading = readArchitectureModel(vault);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.collections).toHaveLength(1);
	const collection = reading.collections[0]!;
	expect(collection.id).toMatch(/^[A-Za-z0-9]{8}$/u);
	expect(collection.file).toBe(`${collection.id}.flows.json`);
	const flow = collection.flows[0]!;
	expect(flow.id).toMatch(/^Shop#[A-Za-z0-9]{8}$/u);
	expect(flow).toMatchObject(request.changes[1]!.flow!);
	expect(reading.relationships).toHaveLength(1);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(before);
	expect(await readArchitectureCheckpoint(vault, result.checkpoint.id)).toMatchObject({
		success: true,
		collections: reading.collections,
	});
	expect(await editArchitectureModule(vault, request)).toEqual(result);
}, 15_000);

test("flow reads reject duplicate subject identities and absent participant references", async () => {
	const { vault } = fixture();
	const document = {
		schemaVersion: 1,
		id: "Behavior",
		name: "Behavior",
		flows: [
			{
				id: "Shop#Gateway",
				name: "Invalid",
				participants: ["Shop#Absent"],
				steps: [
					{
						id: "Shop#Dispatch",
						from: "Shop#Absent",
						to: "Shop#Worker",
						label: "Send",
						kind: "sync",
					},
				],
			},
		],
	};
	writeFileSync(join(vault, "anything.flows.json"), JSON.stringify(document));
	expect(readArchitectureModel(vault)).toMatchObject({
		success: false,
		code: "MODEL_INVALID",
		diagnostics: expect.arrayContaining([
			expect.objectContaining({ code: "DUPLICATE_ID" }),
			expect.objectContaining({ code: "MISSING_LOCAL_TARGET" }),
		]),
	});
}, 15_000);

test("steps move by identity between flows and nested holders with atomic alternative renames", async () => {
	const { vault } = await behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const result = await editArchitectureModule(vault, {
		...input,
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
			{
				type: "edit-flow",
				subject: "Shop#Checkout",
				set: { name: "Purchase", summary: "A renamed flow" },
			},
		],
	});
	expect(result).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.collections[0]!.flows).toMatchObject([
		{
			id: "Shop#Checkout",
			name: "Purchase",
			formerNames: ["Checkout"],
			steps: [
				{
					id: "Shop#Decide",
					alternatives: [
						{
							label: "accepted",
							steps: [{ id: "Shop#Repeat", steps: [{ id: "Shop#Result", kind: "return" }] }],
						},
						{ label: "no", steps: [] },
					],
				},
			],
		},
		{
			id: "Shop#Other",
			steps: [{ id: "Shop#Send", repeat: 3, note: "Keep me" }, { id: "Shop#Notify" }],
		},
	]);
}, 15_000);

test("invalid placements and surviving messages with removed endpoints refuse the complete batch", async () => {
	const { vault } = await behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const original = readArchitectureModel(vault);
	const batches: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"][] = [
		[{ type: "move-step", subject: "Shop#Send", placement: { holder: "Shop#Missing" } }],
		[{ type: "edit-step", subject: "Shop#Decide", set: { alternatives: ["renamed", "no"] } }],
		[
			{ type: "move-step", subject: "Shop#Send", placement: { holder: "Shop#Other" } },
			{ type: "move-step", subject: "Shop#Send", placement: { holder: "Shop#Checkout" } },
		],
		[
			{
				type: "move-step",
				subject: "Shop#Send",
				placement: { holder: "Shop#Checkout", before: "Shop#Decide" },
			},
			{
				type: "move-step",
				subject: "Shop#Decide",
				placement: { holder: "Shop#Checkout", before: "Shop#Send" },
			},
		],
		[{ type: "move-step", subject: "Shop#Repeat", placement: { holder: "Shop#Repeat" } }],
		[
			{ type: "remove-step", subject: "Shop#Send" },
			{ type: "move-step", subject: "Shop#Send", placement: { holder: "Shop#Other" } },
		],
		[
			{
				type: "move-step",
				subject: "Shop#Send",
				placement: { holder: "Shop#Checkout", before: "Shop#Notify" },
			},
		],
		[
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "edit-step", subject: "Shop#Send", set: { label: "Changed dispatch" } },
		],
		[
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "move-step", subject: "Shop#Send", placement: { holder: "Shop#Other" } },
		],
	];
	for (const changes of batches) {
		expect(
			await editArchitectureModule(vault, { ...input, operationId: crypto.randomUUID(), changes }),
		).toMatchObject({ success: false, code: "MODEL_INVALID" });
		expect(readArchitectureModel(vault)).toEqual(original);
	}
}, 15_000);

test("a module removal repairs nested messages and claims every affected flow in its durable operation", async () => {
	const { vault } = await behaviorFixture();
	const input = await structureIntent(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Worker",
		"Shop#Dispatch",
	]);
	const before = readArchitectureModel(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [{ type: "remove-module", subject: "Shop#Worker" }],
		}),
	).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
		diagnostics: expect.arrayContaining([
			expect.objectContaining({
				subjects: expect.arrayContaining([
					"Shop#Checkout",
					"Shop#Other",
					"Shop#Send",
					"Shop#Result",
				]),
			}),
		]),
	});
	expect(readArchitectureModel(vault)).toEqual(before);
	const { releaseArchitectureClaim } = await import("@archboard/board/store-write");
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	const complete = await structureIntent(vault, [...allBehaviorSubjects, "Shop#Dispatch"]);
	const request = {
		...complete,
		changes: [{ type: "remove-module" as const, subject: "Shop#Worker" }],
	};
	const result = await editArchitectureModule(vault, request);
	expect(result).toMatchObject({
		success: true,
		subjects: expect.arrayContaining(["Shop#Checkout", "Shop#Other", "Shop#Send", "Shop#Result"]),
	});
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		collections: [{ flows: [] }],
		relationships: [],
		manifest: {
			retiredIds: expect.arrayContaining([
				"Shop#Worker",
				"Shop#Checkout",
				"Shop#Other",
				"Shop#Send",
				"Shop#Decide",
				"Shop#Repeat",
				"Shop#Result",
				"Shop#Notify",
			]),
		},
	});
	expect(await editArchitectureModule(vault, request)).toEqual(result);
}, 15_000);

test("one batch explicitly removes an incident message and its module while preserving another message", async () => {
	const { vault } = fixture();
	const surviving = {
		id: "Shop#Keep",
		from: "Shop#Gateway",
		to: "Shop#Handler",
		kind: "sync" as const,
		label: "Handle request",
		note: "Keep this behavior",
	};
	writeFileSync(
		join(vault, "checkout.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Behavior",
			flows: [
				{
					id: "Shop#Checkout",
					name: "Checkout",
					participants: ["Shop#Gateway", "Shop#Worker", "Shop#Handler"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
						},
						surviving,
					],
				},
			],
		}),
	);
	const input = await structureIntent(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Worker",
		"Shop#Handler",
		"Shop#Dispatch",
		"Shop#Checkout",
		"Shop#Send",
		"Shop#Keep",
	]);
	const request = {
		...input,
		changes: [
			{ type: "remove-module", subject: "Shop#Worker" },
			{ type: "remove-step", subject: "Shop#Send" },
		],
	} satisfies ArchitectureModuleEdit;
	const result = await editArchitectureModule(vault, request);
	expect(result).toMatchObject({ success: true });
	if (!result.success) throw new Error(JSON.stringify(result));
	const reading = readArchitectureModel(vault);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.collections[0]!.flows).toEqual([
		{
			id: "Shop#Checkout",
			name: "Checkout",
			participants: ["Shop#Gateway", "Shop#Handler"],
			steps: [surviving],
		},
	]);
	expect(reading.modules.map((module) => module.id)).not.toContain("Shop#Worker");
	expect(reading.manifest.retiredIds).toEqual(
		expect.arrayContaining(["Shop#Worker", "Shop#Dispatch", "Shop#Send"]),
	);
	expect(reading.manifest.retiredIds).not.toContain("Shop#Keep");
	expect(await readArchitectureCheckpoint(vault, result.checkpoint.id)).toMatchObject({
		success: true,
		collections: reading.collections,
		manifest: reading.manifest,
	});
	expect(await editArchitectureModule(vault, request)).toEqual(result);
});

test("collection transfers and step field edits keep identity while removals reserve subjects and untouched bytes", async () => {
	const { vault } = await behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const unchanged = readFileSync(join(vault, "worker.module.json"));
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [
				{ type: "remove-collection", collection: "Behavior" },
				{ type: "add-collection", name: "Independent" },
				{ type: "edit-flow", subject: "Shop#Other", collection: "Independent" },
				{
					type: "add-step",
					placement: { holder: "Shop#Other", before: "Shop#Notify" },
					step: { from: "Shop#Worker", to: "Shop#Gateway", kind: "return", label: "A reply" },
				},
				{
					type: "edit-step",
					subject: "Shop#Notify",
					set: { kind: "sync", label: "Updated", note: "Extra", repeat: 2 },
				},
			],
		}),
	).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.collections).toHaveLength(1);
	expect(reading.collections[0]).toMatchObject({
		name: "Independent",
		flows: [
			{
				id: "Shop#Other",
				steps: [
					{ kind: "return", label: "A reply" },
					{ id: "Shop#Notify", kind: "sync", note: "Extra", repeat: 2 },
				],
			},
		],
	});
	expect(reading.manifest.retiredIds).toEqual(
		expect.arrayContaining([
			"Shop#Checkout",
			"Shop#Send",
			"Shop#Decide",
			"Shop#Repeat",
			"Shop#Result",
		]),
	);
	const { releaseArchitectureClaim } = await import("@archboard/board/store-write");
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	const next = await structureIntent(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Worker",
		"Shop#Other",
		"Shop#Notify",
		reading.collections[0]!.flows[0]!.steps[0]!.id,
	]);
	expect(
		await editArchitectureModule(vault, {
			...next,
			changes: [
				{ type: "edit-collection", collection: reading.collections[0]!.id, name: "Renamed" },
				{ type: "edit-step", subject: "Shop#Notify", clear: ["note", "repeat"] },
			],
		}),
	).toMatchObject({ success: true });
	expect(readFileSync(join(vault, "worker.module.json"))).toEqual(unchanged);
	const edited = readArchitectureModel(vault);
	if (!edited.success) throw new Error(JSON.stringify(edited));
	expect(edited.collections[0]!.flows[0]!.steps[1]).not.toHaveProperty("note");
	expect(edited.collections[0]!.flows[0]!.steps[1]).not.toHaveProperty("repeat");
}, 15_000);

test("editing participant membership requires both former and new module claims", async () => {
	const { vault } = behaviorFixture();
	const input = await structureIntent(vault, allBehaviorSubjects);
	const original = readArchitectureModel(vault);
	expect(
		await editArchitectureModule(vault, {
			...input,
			changes: [
				{
					type: "edit-flow",
					subject: "Shop#Other",
					set: { participants: ["Shop#Worker", "Shop#Gateway", "Shop#Handler"] },
				},
			],
		}),
	).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
		diagnostics: expect.arrayContaining([
			expect.objectContaining({ subjects: expect.arrayContaining(["Shop#Handler"]) }),
		]),
	});
	expect(readArchitectureModel(vault)).toEqual(original);
}, 15_000);

test("one intent can author a flow over a module that it adds without caller-chosen identities", async () => {
	const { vault } = fixture();
	const input = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const result = await editArchitectureModule(vault, {
		...input,
		changes: [
			{ type: "add-collection", name: "New responsibilities" },
			{
				type: "add-flow",
				collection: "New responsibilities",
				flow: {
					name: "Cache request",
					participants: ["Gateway", "Cache"],
					steps: [{ from: "Gateway", to: "Cache", kind: "sync", label: "Read" }],
				},
			},
			{ type: "add-module", module: { name: "Cache", kind: "service", order: 30 } },
		],
	});
	expect(result).toMatchObject({ success: true });
	const reading = readArchitectureModel(vault, "Cache");
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.collections[0]!.flows[0]).toMatchObject({
		participants: ["Shop#Gateway", reading.selectedModule],
		steps: [{ from: "Shop#Gateway", to: reading.selectedModule }],
	});
}, 15_000);
