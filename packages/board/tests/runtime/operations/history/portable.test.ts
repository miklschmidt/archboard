import { afterEach, expect, test } from "bun:test";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	retainArchitectureCheckpoint,
} from "@archboard/board/store-write";
import { fixture, git } from "../model-edit/fixture.ts";
import { destination, empty, cleanPortableFixtures } from "./portable-fixture.ts";
afterEach(cleanPortableFixtures);
test("portable import preserves current bytes and exact retained identities without repository source", async () => {
	const source = fixture();
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "current",
		expectedRevision: current.revision.digest,
		operationId: "portable-baseline",
		writer: "agent",
		doing: "retaining export evidence",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "portable-install",
		writer: "agent",
		doing: "restoring portable architecture",
	};
	const installed = await importArchitectureModel(target.vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	expect(installed.success).toBe(true);
	const reopened = readArchitectureModel(target.vault);
	expect(reopened.success).toBe(true);
	if (!reopened.success) throw new Error(JSON.stringify(reopened));
	expect(reopened.manifest).toEqual(current.manifest);
	expect(reopened.revision).toEqual(current.revision);
	expect(readFileSync(join(target.vault, "gateway.module.json"))).toEqual(
		readFileSync(join(source.vault, "gateway.module.json")),
	);
	const exact = await readArchitectureCheckpoint(target.vault, retained.checkpoint.id);
	expect(exact.success).toBe(true);
	expect(git(target.root, "rev-list", "--all", "--", "code.ts")).toBe("");
	expect(await importArchitectureModel(target.vault, request)).toEqual(installed);
});

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
