import { afterEach, expect, test } from "bun:test";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	retainArchitectureCheckpoint,
} from "@archboard/board/store-write";
import { fixture, git } from "../model-edit/fixture.ts";
import { destination, empty, cleanPortableFixtures } from "./portable-fixture.ts";
afterEach(cleanPortableFixtures);
test("incomplete narrative history refuses import before exposing authored inputs", async () => {
	const source = fixture();
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "current",
		expectedRevision: current.revision.digest,
		operationId: "target",
		writer: "agent",
		doing: "retaining narrative target",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const { structureIntent } = await import("../model-edit/fixture.ts");
	const { editArchitectureModule } = await import("@archboard/board/store-write");
	const made = await editArchitectureModule(source.vault, {
		...(await structureIntent(source.vault, ["Shop"])),
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Pinned tour",
					target: { checkpoint: retained.checkpoint.id },
					beats: [
						{
							title: "Gateway",
							narrative: "Follow the gateway.",
							reading: { scope: "Shop#Gateway", grammar: "architecture" },
						},
					],
				},
			},
		],
	});
	if (!made.success) throw new Error(JSON.stringify(made));
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const incomplete = { ...exported.bundle, history: { tips: [], bundle: null } };
	const refused = await importArchitectureModel(target.vault, {
		bundle: incomplete,
		expectedRevision: empty,
		operationId: "missing-target",
		writer: "agent",
		doing: "restoring portable architecture",
	});
	expect(refused.success).toBe(false);
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: false,
		code: "MODEL_NOT_FOUND",
	});
	expect(git(target.root, "for-each-ref", "--format=%(refname)")).toBe("");

	const corrupt = {
		...exported.bundle,
		history: {
			...exported.bundle.history,
			bundle: Buffer.from(exported.bundle.history.bundle!, "base64")
				.subarray(0, 64)
				.toString("base64"),
		},
	};
	expect(
		await importArchitectureModel(target.vault, {
			bundle: corrupt,
			expectedRevision: empty,
			operationId: "corrupt-target",
			writer: "agent",
			doing: "restoring a damaged bundle",
		}),
	).toMatchObject({ success: false, code: "CHECKPOINT_INVALID", applied: false });
	const installed = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "complete-target",
		writer: "agent",
		doing: "restoring portable architecture",
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const playback = await readArchitectureModel(target.vault, undefined, undefined, {
		walkthrough: "Pinned tour",
	});
	expect(playback.success && playback.playback?.checkpoint).toBe(retained.checkpoint.id);
}, 15000);

test("a planning-only model imports without inventing a current state", async () => {
	const source = fixture();
	const { writeFileSync } = await import("node:fs");
	const manifest = JSON.parse(readFileSync(join(source.vault, "model.json"), "utf8"));
	manifest.current = null;
	writeFileSync(join(source.vault, "model.json"), JSON.stringify(manifest));
	for (const path of ["gateway.module.json", "worker.module.json", "internal"])
		rmSync(join(source.vault, path), { recursive: true });
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const installed = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "planning-import",
		writer: "agent",
		doing: "restoring planned architecture",
	});
	expect(installed.success).toBe(true);
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: true,
		manifest: { current: null },
		selectedState: null,
	});
});

test("invalid portable bytes and different destination content refuse without changing authored inputs or refs", async () => {
	const source = fixture();
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = fixture();
	const { writeFileSync } = await import("node:fs");
	const file = join(target.vault, "gateway.module.json");
	const module = JSON.parse(readFileSync(file, "utf8"));
	module.description = "Independent destination work.";
	writeFileSync(file, JSON.stringify(module));
	const current = readArchitectureModel(target.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const request = {
		bundle: exported.bundle,
		expectedRevision: current.revision,
		operationId: "refused-import",
		writer: "agent",
		doing: "restoring portable architecture",
	};
	const bytes = readFileSync(file);
	const refs = git(target.root, "for-each-ref", "--format=%(refname) %(objectname)");
	for (const bundle of [
		{ ...exported.bundle, inputs: [{ path: "model.json", bytes: "AA=A" }] },
		{ ...exported.bundle, history: { ...exported.bundle.history, bundle: "AAAA\n" } },
	]) {
		await expect(importArchitectureModel(target.vault, { ...request, bundle })).rejects.toThrow();
	}
	expect(await importArchitectureModel(target.vault, request)).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
	const corrupt = {
		...exported.bundle,
		inputs: exported.bundle.inputs.map((input, index) =>
			index === 0
				? Object.assign({}, input, { bytes: Buffer.from("corrupt").toString("base64") })
				: input,
		),
	};
	expect(
		await importArchitectureModel(target.vault, { ...request, bundle: corrupt }),
	).toMatchObject({ success: false, code: "CHECKPOINT_INVALID", applied: false });
	expect(readFileSync(file)).toEqual(bytes);
	expect(git(target.root, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(refs);
});
