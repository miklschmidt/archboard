import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ArchitectureModuleEditSchema } from "@archboard/board/model";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	retainArchitectureCheckpoint,
	releaseArchitectureClaim,
	editArchitectureModule,
} from "@archboard/board/store-write";
import {
	fixture,
	structureIntent,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("one public edit authors narrative readings without changing module bytes and retains exact inputs", async () => {
	const { vault } = fixture();
	const bytes = readFileSync(join(vault, "gateway.module.json"));
	const intent = await structureIntent(vault, ["Shop"]);
	const result = await editArchitectureModule(
		vault,
		ArchitectureModuleEditSchema.parse({
			...intent,
			changes: [
				{
					type: "add-walkthrough",
					walkthrough: {
						name: "Request tour",
						target: { state: "current" },
						beats: [
							{
								title: "Gateway",
								narrative: "Start at the gateway.",
								reading: {
									scope: "Shop#Gateway",
									selection: ["Shop#Gateway"],
									grammar: "architecture",
								},
							},
							{
								title: "Worker",
								narrative: "Follow the worker.",
								reading: {
									focus: ["Shop#Worker"],
									filters: { relationships: ["call"], groups: [] },
									grammar: "architecture",
								},
							},
						],
					},
				},
			],
		}),
	);
	expect(result.success).toBe(true);
	if (!result.success) return;
	const read = readArchitectureModel(vault);
	expect(read.success).toBe(true);
	if (!read.success) return;
	expect(read.walkthroughs).toHaveLength(1);
	const tour = read.walkthroughs[0]!;
	expect(tour.id).toMatch(/^Shop#/u);
	expect(new Set(tour.beats.map((beat) => beat.id)).size).toBe(2);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(bytes);
	const retained = await readArchitectureCheckpoint(vault, result.checkpoint.id);
	expect(retained.success && retained.walkthroughs).toEqual(read.walkthroughs);
	expect(readFileSync(join(vault, tour.file), "utf8")).not.toContain('"modules"');
});

test("narrative edits keep beat identity, reject stale writes, and retire removed beats through complete claims", async () => {
	const { vault } = fixture();
	const creation = await structureIntent(vault, ["Shop"]);
	const created = await editArchitectureModule(
		vault,
		ArchitectureModuleEditSchema.parse({
			...creation,
			changes: [
				{
					type: "add-walkthrough",
					walkthrough: {
						name: "Tour",
						target: { state: "current" },
						beats: [
							{ title: "One", narrative: "Start.", reading: { grammar: "architecture" } },
							{ title: "Two", narrative: "End.", reading: { grammar: "architecture" } },
						],
					},
				},
			],
		}),
	);
	expect(created.success).toBe(true);
	const read = readArchitectureModel(vault);
	if (!read.success) throw new Error(JSON.stringify(read));
	const walk = read.walkthroughs[0]!;
	await releaseArchitectureClaim(vault, { claim: creation.claim, writer: creation.writer });
	const intent = await structureIntent(vault, [
		"Shop",
		walk.id,
		...walk.beats.map((beat) => beat.id),
	]);
	const request = ArchitectureModuleEditSchema.parse({
		...intent,
		changes: [
			{
				type: "edit-walkthrough",
				subject: walk.id,
				set: { name: "Renamed" },
				beats: [{ ...walk.beats[0], narrative: "Updated." }],
			},
		],
	});
	const result = await editArchitectureModule(vault, request);
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(await editArchitectureModule(vault, request)).toEqual(result);
	const stale = await editArchitectureModule(vault, { ...request, operationId: "stale-tour" });
	expect(!stale.success && stale.code).toBe("STALE_REVISION");
	const after = readArchitectureModel(vault);
	if (!after.success) throw new Error(JSON.stringify(after));
	expect(after.walkthroughs[0]!.beats[0]!.id).toBe(walk.beats[0]!.id);
	expect(after.walkthroughs[0]!.formerNames).toEqual(["Tour"]);
	expect(after.manifest.retiredIds).toContain(walk.beats[1]!.id);
});

test("playback resolves one complete revision, reports missing subjects per beat, and requires retention for sharing", async () => {
	const { vault } = fixture();
	const creation = await structureIntent(vault, ["Shop"]);
	const made = await editArchitectureModule(vault, {
		...creation,
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Playback",
					target: { state: "current" },
					beats: [
						{
							title: "Start",
							narrative: "Read the gateway.",
							reading: {
								scope: "Shop#Gateway",
								grammar: "architecture",
								selection: [],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
						{
							title: "Absent",
							narrative: "An old subject.",
							reading: {
								grammar: "architecture",
								selection: ["Shop#Missing"],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
					],
				},
			},
		],
	});
	if (!made.success) throw new Error(JSON.stringify(made));
	const playback = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Playback",
	});
	if (!playback.success) throw new Error(JSON.stringify(playback));
	expect(playback.playback?.beats.map((beat) => beat.status)).toEqual(["ready", "unavailable"]);
	expect(playback.playback?.beats[1]!.diagnostics[0]?.subjects).toEqual(["Shop#Missing"]);
	const shared = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Playback",
		shared: true,
	});
	expect(!shared.success && shared.code).toBe("CHECKPOINT_REQUIRED");
	const pinned = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Playback",
		checkpoint: made.checkpoint.id,
		shared: true,
	});
	expect(pinned.success && pinned.playback?.checkpoint).toBe(made.checkpoint.id);
	await releaseArchitectureClaim(vault, { claim: creation.claim, writer: creation.writer });
	const edit = await structureIntent(vault, ["Shop#Gateway"]);
	await editArchitectureModule(vault, {
		...edit,
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Changed after playback." },
			},
		],
	});
	const restart = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Playback",
	});
	expect(restart.success && restart.playback?.revision.digest).not.toBe(
		playback.playback?.revision.digest,
	);
	expect(playback.modules.find((module) => module.id === "Shop#Gateway")?.description).not.toBe(
		"Changed after playback.",
	);
	const reopen = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Playback",
		checkpoint: made.checkpoint.id,
	});
	expect(reopen.success && reopen.modules).toEqual(playback.modules);
});

test("an authored named proposal target resolves one complete draft reading", async () => {
	const { vault } = fixture();
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Proposal tour",
			target: { state: "Queued" },
			beats: [
				{
					id: "Shop#Intro",
					title: "Gateway",
					narrative: "Explain the queue.",
					reading: { grammar: "architecture", scope: "Shop#Gateway" },
				},
			],
		}),
	);
	const intent = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const draft = await editArchitectureModule(vault, {
		...intent,
		proposal: { type: "create", name: "Queued" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues requests." } },
		],
	});
	if (!draft.success) throw new Error(JSON.stringify(draft));
	const playback = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Proposal tour",
	});
	if (!playback.success) throw new Error(JSON.stringify(playback));
	expect(playback.selectedState?.id).toBe(draft.target.state!);
	expect(playback.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Queues requests.",
	);
});

test("exact narrative targets retain their history and unavailable targets never substitute current", async () => {
	const { vault } = fixture();
	const initial = readArchitectureModel(vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const baseline = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "exact-target",
		writer: "agent",
		doing: "retaining a narrative target",
		expectedRevision: initial.revision.digest,
		dependencies: [],
	});
	if (!baseline.success) throw new Error(JSON.stringify(baseline));
	const add = await structureIntent(vault, ["Shop"]);
	const made = await editArchitectureModule(vault, {
		...add,
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Exact tour",
					target: { checkpoint: baseline.checkpoint.id },
					beats: [
						{
							title: "Gateway",
							narrative: "Read the original.",
							reading: {
								grammar: "architecture",
								selection: [],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
					],
				},
			},
		],
	});
	if (!made.success) throw new Error(JSON.stringify(made));
	const playback = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Exact tour",
		shared: true,
	});
	expect(playback.success && playback.playback?.checkpoint).toBe(baseline.checkpoint.id);
	const read = readArchitectureModel(vault);
	if (!read.success) throw new Error(JSON.stringify(read));
	const walk = read.walkthroughs[0]!;
	const { file, ...definition } = walk;
	writeFileSync(
		join(vault, file),
		JSON.stringify({ ...definition, target: { checkpoint: "a".repeat(40) } }),
	);
	const missing = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: walk.id,
	});
	expect(missing.success).toBe(false);
	if (missing.success) return;
	expect(missing.code).toBe("ARCHITECTURE_UNAVAILABLE");
	expect(missing.diagnostics[0]!.recovery.length).toBeGreaterThan(0);
});
