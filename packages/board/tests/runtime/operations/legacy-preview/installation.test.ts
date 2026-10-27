import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import * as writes from "@archboard/board/store-write";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("an owner installs a complete preview once and reopens exact original readings after live removal", async () => {
	const { home, vault } = narrativeFixture();
	homes.push(home);
	rmSync(join(vault, "Future.semantic.json"));
	await savePreviewPlan(vault);
	const original = readFileSync(join(vault, "Shop.semantic.json"));
	const preview = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!preview.success) throw new Error(JSON.stringify(preview));
	expect(preview.migrationPreview?.installation).toBeDefined();
	const request = {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner" as const,
		operationId: "cutover-1",
		writer: "owner",
		doing: "Install the approved preview",
	};
	const result = await writes.migrateArchitectureModel(vault, request);
	expect(result).toMatchObject({ success: true, applied: true, cleanup: "complete" });
	if (!result.success) throw new Error(JSON.stringify(result));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current).not.toHaveProperty("migrationPreview");
	expect(current.modules.map((m) => m.id)).toEqual(preview.modules.map((m) => m.id));
	expect(current.migration?.bookmarks?.map((b) => b.id)).toEqual(["Shop/System#Unused"]);
	const bookmark = await readArchitectureModel(vault, undefined, undefined, {
		bookmark: "Shop/System#Unused",
	});
	expect(bookmark).toMatchObject({
		success: true,
		migration: { bookmark: { id: "Shop/System#Unused" } },
	});
	expect(bookmark).not.toHaveProperty("migrationPreview");
	const alias = await readArchitectureModel(vault, undefined, undefined, {
		legacyAddress: "Store@Implemented",
	});
	expect(alias).toMatchObject({
		success: true,
		checkpoint: { id: current.migration!.checkpoint },
		migrationPreview: { selected: { legacy: "Shop/System#Now" } },
	});
	for (const selection of [
		{ legacyAddress: "Unknown" },
		{ legacyAddress: "Store@Implemented", state: "Shop/System#Old" },
		{ legacyAddress: "Store@Implemented", checkpoint: "f".repeat(40) },
	])
		expect(await readArchitectureModel(vault, undefined, undefined, selection)).toMatchObject({
			success: false,
			code: selection.legacyAddress === "Unknown" ? "LEGACY_ADDRESS_NOT_FOUND" : "TARGET_CHANGED",
		});
	expect(existsSync(join(vault, "Shop.semantic.json"))).toBe(false);
	expect(existsSync(join(vault, ".archboard/migration-plan.json"))).toBe(false);
	expect(await writes.migrateArchitectureModel(vault, request)).toEqual(result);
	expect(
		await writes.migrateArchitectureModel(vault, { ...request, doing: "Another intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
	const retained = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: current.migration!.checkpoint,
		legacyAddress: "Store@Implemented",
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(
		retained.migrationPreview?.originalInputs?.find((i) => i.file === "Shop.semantic.json")?.base64,
	).toBe(original.toString("base64"));
	expect(retained.migrationPreview?.selected?.legacy).toBe("Shop/System#Now");
	const playback = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Shop/System#Tour",
	});
	expect(playback).toMatchObject({
		success: true,
		playback: {
			beats: [
				{ id: "Shop/System#Start", status: "ready" },
				{ id: "Shop/System#Call", status: "ready" },
				{ id: "Shop/System#End", status: "ready" },
			],
		},
	});
});
