import { request as familyRequest } from "#tests/runtime/operations/proposals/fixture.ts";
import type { ArchitectureEvent } from "@archboard/board/model";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	watchArchitectureModel,
} from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import {
	behaviorFixture,
	allBehaviorSubjects,
} from "#tests/runtime/operations/model-edit/flow-fixture.ts";
import { structureIntent, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("one compact proposal changes modules and flows while current authored inputs stay exact", async () => {
	const { vault } = behaviorFixture();
	const original = new Map(
		readdirSync(vault)
			.filter((file) => file.endsWith(".json"))
			.map((file) => [file, readFileSync(join(vault, file))]),
	);
	const intent = await structureIntent(vault, allBehaviorSubjects);
	const events: ArchitectureEvent[] = [];
	const stop = watchArchitectureModel(vault, (event) => events.push(event));
	const result = await editArchitectureModule(vault, {
		...intent,
		proposal: { type: "create", name: "Queued dispatch", summary: "Queue accepted work" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted work." },
			},
			{
				type: "edit-step",
				subject: "Shop#Send",
				set: { kind: "async", label: "Enqueue" },
				clear: ["note"],
			},
		],
	}).finally(stop);
	expect(result).toMatchObject({ success: true });
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(events.find((event) => event.type === "architecture_changed")).toMatchObject({
		state: result.target.state,
		operation: { selectedState: { lifecycle: "draft" } },
	});
	for (const [file, bytes] of original) expect(readFileSync(join(vault, file))).toEqual(bytes);
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.proposals).toHaveLength(1);
	const proposal = current.proposals[0]!;
	expect(proposal).toMatchObject({
		name: "Queued dispatch",
		lifecycle: "draft",
		predecessor: "Current",
	});
	const stored = JSON.parse(readFileSync(join(vault, proposal.file), "utf8"));
	expect(stored.changes.map((change: { type: string }) => change.type)).toEqual([
		"assign",
		"assign",
		"assign",
		"clear",
	]);
	expect(JSON.stringify(stored)).not.toContain("Ready?");
	expect(JSON.stringify(stored)).not.toContain("participants");
	const selected = await readArchitectureModel(vault, undefined, undefined, { state: proposal.id });
	expect(selected).toMatchObject({
		success: true,
		selectedState: { id: proposal.id, lifecycle: "draft" },
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Queues accepted work.",
	);
	expect(selected.collections[0]!.flows[0]!.steps[0]).toMatchObject({
		id: "Shop#Send",
		kind: "async",
		label: "Enqueue",
	});
	expect(selected.collections[0]!.flows[0]!.steps[0]).not.toHaveProperty("note");
	expect(selected.comparison).toMatchObject({
		reason: "current",
		against: { id: "Current", lifecycle: "current" },
	});
	expect(
		await editArchitectureModule(vault, {
			...intent,
			proposal: { type: "create", name: "Queued dispatch", summary: "Queue accepted work" },
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Gateway",
					set: { description: "Queues accepted work." },
				},
				{
					type: "edit-step",
					subject: "Shop#Send",
					set: { kind: "async", label: "Enqueue" },
					clear: ["note"],
				},
			],
		}),
	).toEqual(result);
}, 15_000);

test("sibling proposals mint separate additions and explicit comparison keeps both sides distinct", async () => {
	const { vault } = behaviorFixture();
	const input = await structureIntent(vault, ["Shop"]);
	const first = await editArchitectureModule(vault, {
		...input,
		proposal: { type: "create", name: "Alternative A" },
		changes: [{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } }],
	});
	if (!first.success) throw new Error(JSON.stringify(first));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const second = await editArchitectureModule(vault, {
		...input,
		operationId: "alternative-b",
		expectedRevision: current.revision,
		proposal: { type: "create", name: "Alternative B" },
		changes: [{ type: "add-module", module: { name: "Cache", kind: "service", order: 40 } }],
	});
	if (!second.success) throw new Error(JSON.stringify(second));
	const compared = await readArchitectureModel(vault, "Cache", undefined, {
		state: "Alternative B",
		against: "Alternative A",
	});
	expect(compared).toMatchObject({
		success: true,
		selectedState: { lifecycle: "draft" },
		comparison: { reason: "explicit" },
	});
	if (!compared.success) throw new Error(JSON.stringify(compared));
	const different = compared.comparison?.subjects.filter(
		(subject) => subject.subjectKind === "module" && subject.kind !== "unchanged",
	);
	expect(different?.map((subject) => subject.kind).toSorted()).toEqual(["added", "removed"]);
	expect(new Set(different?.map((subject) => subject.id)).size).toBe(2);
	expect(compared.proposals.map((proposal) => proposal.predecessor)).toEqual([
		"Current",
		"Current",
	]);
}, 15_000);

test("retained comparisons identify the live base revision independently of the retained draft", async () => {
	const { vault } = behaviorFixture();
	const intent = await structureIntent(vault, [
		"Shop",
		"Shop#Gateway",
		"Shop#Dispatch",
		"Shop#Worker",
	]);
	const created = await editArchitectureModule(vault, {
		...intent,
		proposal: { type: "create", name: "Queued delivery" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued API" } },
			{ type: "remove-relationship", subject: "Shop#Dispatch" },
		],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const advanced = await editArchitectureModule(vault, {
		...(await familyRequest(vault)),
		operationId: "advance-current-for-comparison",
		expectedRevision: current.revision,
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Current architecture changed after retention." },
			},
		],
	});
	if (!advanced.success) throw new Error(JSON.stringify(advanced));
	const retained = await readArchitectureCheckpoint(vault, created.checkpoint.id);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(retained.comparison?.revision).toEqual(advanced.after);
	expect(retained.revision).toEqual(created.checkpoint.revision);
	expect(retained.comparison?.revision.digest).not.toBe(retained.revision.digest);
	const explain = {
		actionId: "proposal-explanation",
		action: "explain-proposal" as const,
		model: current.manifest.id,
		expectedRevision: created.checkpoint.revision.digest,
		expectedComparisonRevision: retained.comparison!.revision.digest,
		subjects: ["Shop#Gateway"],
		reading: {
			focus: [],
			relationshipKinds: ["call"],
			groups: true,
			grammar: "sequence" as const,
			flow: "Shop#Checkout",
		},
	};
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			explain,
		}),
	).toMatchObject({
		success: true,
		selectedFlow: "Shop#Checkout",
		explanation: {
			state: { id: created.target.state, lifecycle: "draft" },
			checkpoint: created.checkpoint.id,
			revision: created.checkpoint.revision,
			comparison: { against: { id: "Current" }, revision: advanced.after },
		},
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			explain: { ...explain, action: "explain-relationship", subjects: ["Shop#Dispatch"] },
		}),
	).toMatchObject({ success: true, explanation: { request: { subjects: ["Shop#Dispatch"] } } });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			state: "current",
			explain,
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
	const { expectedComparisonRevision: _comparison, ...unguarded } = explain;
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			explain: unguarded,
		}),
	).toMatchObject({ success: false, code: "MODEL_CHANGED" });
	const changed = await editArchitectureModule(vault, {
		...(await familyRequest(vault)),
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "The comparison changed after the pane captured its reading." },
			},
		],
	});
	if (!changed.success) throw new Error(JSON.stringify(changed));
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			explain,
		}),
	).toMatchObject({ success: false, code: "MODEL_CHANGED" });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			explain: { ...explain, expectedComparisonRevision: changed.after.digest },
		}),
	).toMatchObject({
		success: true,
		explanation: {
			revision: created.checkpoint.revision,
			comparison: { revision: changed.after },
		},
	});
}, 20_000);

test("compact proposals store narrative beats as independent stable subjects and materialize exact retained playback inputs", async () => {
	const { vault } = behaviorFixture();
	const input = await structureIntent(vault, ["Shop"]);
	const result = await editArchitectureModule(vault, {
		...input,
		proposal: { type: "create", name: "Narrated draft" },
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Draft tour",
					target: { state: "current" },
					beats: [
						{
							title: "Queue",
							narrative: "Dispatch this request.",
							reading: {
								grammar: "sequence",
								flow: "Shop#Checkout",
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
	expect(result.success).toBe(true);
	if (!result.success) throw new Error(JSON.stringify(result));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.walkthroughs).toEqual([]);
	const proposal = current.proposals[0]!;
	expect(
		proposal.changes.filter((change) => change.type === "add").map((change) => change.kind),
	).toEqual(["walkthrough", "beat"]);
	expect(JSON.stringify(proposal.changes)).not.toContain('"modules"');
	const draft = await readArchitectureModel(vault, undefined, undefined, { state: proposal.id });
	if (!draft.success) throw new Error(JSON.stringify(draft));
	expect(draft.walkthroughs[0]!.beats[0]!.narrative).toBe("Dispatch this request.");
	const retained = await readArchitectureCheckpoint(vault, result.checkpoint.id);
	expect(retained.success && retained.walkthroughs).toEqual(draft.walkthroughs);
});
