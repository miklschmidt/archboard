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
	const groups = Object.keys(current.policy.groups);
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain: { ...explain, reading: { ...explain.reading, groups } },
		}),
	).toMatchObject({ success: true, explanation: { request: { reading: { groups } } } });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain: { ...explain, reading: { ...explain.reading, groups: ["missing"] } },
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
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
	expect(await readArchitectureModel(vault, "Shop#Worker", undefined, { explain })).toMatchObject({
		success: false,
		code: "MODEL_INVALID",
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain,
			model: "Shop",
			code: true,
			references: true,
		}),
	).toMatchObject({
		success: true,
		explanation: { request: explain },
		codeBinding: { repo: "github.com/acme/shop", path: "src/gateway.ts" },
		codeTarget: { ok: false },
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			explain,
			reference: 0,
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
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
