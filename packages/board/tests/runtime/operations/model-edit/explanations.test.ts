import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { fixture, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";

afterEach(disposeFixtures);

test("an explanation captures the complete reading without changing authored inputs", async () => {
	const { vault } = fixture();
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const before = readFileSync(join(vault, "gateway.module.json"));
	const explain = {
		actionId: "selection-1",
		action: "explain-selection" as const,
		model: current.manifest.id,
		expectedRevision: current.revision.digest,
		subjects: ["Shop#Gateway"],
		reading: {
			focus: [],
			relationshipKinds: ["call"],
			groups: false,
			grammar: "architecture" as const,
		},
	};
	const captured = await readArchitectureModel(vault, undefined, undefined, { explain });
	expect(captured).toMatchObject({
		success: true,
		explanation: {
			request: explain,
			state: current.selectedState,
			revision: current.revision,
			investigate: false,
		},
	});
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(before);
	writeFileSync(join(vault, "gateway.module.json"), `${before.toString()}\n`);
	expect(await readArchitectureModel(vault, undefined, undefined, { explain })).toMatchObject({
		success: false,
		code: "MODEL_CHANGED",
	});
});

test("relationship and missing-flow explanations retain stable reading intent and refuse absent subjects", async () => {
	const { vault } = fixture();
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const explain = {
		actionId: "relationship-1",
		action: "explain-relationship" as const,
		model: current.manifest.id,
		expectedRevision: current.revision.digest,
		subjects: ["Shop#Dispatch"],
		reading: {
			scope: "Shop#Gateway",
			focus: ["Shop#Worker"],
			referenceSubject: "Shop#Dispatch",
			relationshipKinds: ["call"],
			groups: false,
			grammar: "architecture" as const,
		},
	};
	expect(await readArchitectureModel(vault, undefined, undefined, { explain })).toMatchObject({
		success: true,
		explanation: { request: explain },
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain: {
				...explain,
				action: "trace-flow",
				subjects: [],
				question: "Investigate how requests finish",
			},
		}),
	).toMatchObject({ success: true, explanation: { investigate: true } });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain: { ...explain, subjects: ["Shop#Absent"] },
		}),
	).toMatchObject({
		success: false,
		code: "MODEL_INVALID",
		diagnostics: [{ subjects: ["Shop#Absent"] }],
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain: { ...explain, reading: { ...explain.reading, flow: "Shop#Absent" } },
		}),
	).toMatchObject({ success: false, code: "FLOW_NOT_FOUND" });
});

test("a proposal explanation pins its exact checkpoint and the independent comparison revision", async () => {
	const { behaviorFixture } = await import("#tests/runtime/operations/model-edit/flow-fixture.ts");
	const { structureIntent } = await import("#tests/runtime/operations/model-edit/fixture.ts");
	const { editArchitectureModule } = await import("@archboard/board/store-write");
	const { vault } = behaviorFixture();
	const intent = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const created = await editArchitectureModule(vault, {
		...intent,
		proposal: { type: "create", name: "Queue requests" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Queued gateway" } }],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const advanced = await editArchitectureModule(vault, {
		...intent,
		operationId: "advance-for-explanation",
		expectedRevision: current.revision,
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "The implementation changed." },
			},
		],
	});
	if (!advanced.success) throw new Error(JSON.stringify(advanced));
	const explain = {
		actionId: "proposal-1",
		action: "explain-proposal" as const,
		model: current.manifest.id,
		expectedRevision: created.checkpoint.revision.digest,
		subjects: ["Shop#Gateway"],
		reading: {
			focus: [],
			relationshipKinds: ["call"],
			groups: true,
			grammar: "sequence" as const,
			flow: "Shop#Checkout",
		},
	};
	const result = await readArchitectureModel(vault, undefined, undefined, {
		checkpoint: created.checkpoint.id,
		explain,
	});
	expect(result).toMatchObject({
		success: true,
		selectedFlow: "Shop#Checkout",
		explanation: {
			checkpoint: created.checkpoint.id,
			state: { id: created.target.state, lifecycle: "draft" },
			revision: created.checkpoint.revision,
			comparison: { against: { id: "Current" }, revision: advanced.after },
			investigate: false,
		},
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			checkpoint: created.checkpoint.id,
			state: "current",
			explain,
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
}, 15_000);
