import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeIdentity } from "#runtime/store/address.ts";
import { SemanticBoardSchema } from "@archboard/board/document";
import { paneBoardAddress } from "@archboard/board/address";
import { addressedVariant } from "@archboard/board/document";
import { readArchitectureModel } from "@archboard/board/store-read";
import * as writes from "@archboard/board/store-write";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
import { installationFixture } from "#tests/runtime/operations/legacy-preview/install-fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("installed original addresses reopen the exact readings emitted by the legacy pane interface", async () => {
	const fixture = narrativeFixture();
	homes.push(fixture.home);
	const current = fixture.original.variants[0]!;
	const historical = {
		...structuredClone(current),
		id: "Past",
		name: "Old",
		lifecycle: "historical",
	};
	historical.content.nodes[1]!.name = "Former API";
	fixture.original.variants = [historical, current];
	writeFileSync(join(fixture.vault, "Shop.semantic.json"), JSON.stringify(fixture.original));
	const selections = ["current", "Old", "Past"].map((variant) => {
		const identity = makeIdentity({ board: fixture.original.name, variant });
		const legacy = addressedVariant(SemanticBoardSchema.parse(fixture.original), identity.variant);
		if (!legacy.ok) throw new Error(JSON.stringify(legacy));
		return { address: paneBoardAddress(identity), state: legacy.variant };
	});
	expect(selections.map((entry) => entry.address)).toEqual(["shop", "shop@Old", "shop@Past"]);
	const { vault, request } = await installationFixture(fixture);
	const installed = await writes.migrateArchitectureModel(vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const canonical = readArchitectureModel(vault);
	if (!canonical.success) throw new Error(JSON.stringify(canonical));
	for (const { address, state } of selections) {
		const result = await readArchitectureModel(vault, undefined, undefined, {
			legacyAddress: address,
		});
		if (!result.success) throw new Error(JSON.stringify({ address, result }));
		expect(result).toMatchObject({
			checkpoint: { id: canonical.migration!.checkpoint },
			migrationPreview: {
				selected: { legacy: `Shop/System#${state.id}`, completeModel: false },
				resolvedAddress: { address, board: "System", state: `Shop/System#${state.id}` },
			},
		});
		expect(result.modules.find((module) => module.id === "Shop/System#Api")?.name).toBe(
			state.content.nodes.find((node) => node.id === "Api")!.name,
		);
	}
	expect(
		await readArchitectureModel(vault, undefined, undefined, { legacyAddress: "sHoP@Old" }),
	).toMatchObject({ success: false, code: "LEGACY_ADDRESS_NOT_FOUND" });
});

test("captured public pane keys preserve ambiguity between original board families", async () => {
	const { home, vault, planned } = narrativeFixture();
	homes.push(home);
	writeFileSync(
		join(vault, "Future.semantic.json"),
		JSON.stringify({ ...planned, formerNames: ["SHOP"] }),
	);
	await savePreviewPlan(vault);
	const result = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		legacyAddress: paneBoardAddress(makeIdentity({ board: "Shop" })),
	});
	expect(result).toMatchObject({
		success: false,
		code: "LEGACY_ADDRESS_AMBIGUOUS",
		diagnostics: [{ subjects: ["Shop/Future#Draft", "Shop/System#Now"] }],
	});
});

test("an installed bookmark reports removed subjects without replacing its exact original reading", async () => {
	const { home, vault, request } = await installationFixture();
	homes.push(home);
	const installed = await writes.migrateArchitectureModel(vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const before = await readArchitectureModel(vault, undefined, undefined, {
		bookmark: "Shop/System#Unused",
	});
	if (!before.success) throw new Error(JSON.stringify(before));
	const bookmark = before.migration!.bookmark!;
	expect(bookmark.diagnostics).toEqual([]);
	expect(bookmark.reading.visibility?.modules).toEqual(["Shop/System#Db"]);
	const database = before.modules.find((module) => module.id === "Shop/System#Db")!;
	const api = before.modules.find((module) => module.id === "Shop/System#Api")!;
	const { file, ...input } = api;
	writeFileSync(join(vault, file), JSON.stringify({ ...input, outgoing: [] }));
	rmSync(join(vault, database.file));
	for (const entry of [...before.collections, ...before.walkthroughs])
		rmSync(join(vault, entry.file));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.map((module) => module.id)).not.toContain("Shop/System#Db");
	const selected = await readArchitectureModel(vault, undefined, undefined, {
		bookmark: bookmark.id,
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.migration?.bookmark?.diagnostics).toMatchObject([
		{ code: "BOOKMARK_SUBJECT_MISSING", subjects: ["Shop/System#Db"] },
	]);
	expect(selected.migration?.bookmark?.reading).toEqual(bookmark.reading);
	expect(selected.revision).toEqual(current.revision);
	expect(selected.modules).toEqual(current.modules);
	expect(selected).not.toHaveProperty("migrationPreview");
	const original = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: before.migration!.checkpoint,
		bookmark: bookmark.id,
	});
	if (!original.success) throw new Error(JSON.stringify(original));
	expect(original.migrationPreview?.bookmark).toEqual(bookmark);
	expect(original.modules.map((module) => module.id)).toContain("Shop/System#Db");
});

test("installed behavioral bookmarks retain conversion refusals and report removed flows", async () => {
	const fixture = narrativeFixture();
	homes.push(fixture.home);
	fixture.original.variants[0]!.content.walkthroughs[0]!.beats.splice(1, 1);
	fixture.original.views.push({
		id: "NoFlow",
		name: "No flow",
		grammar: "sequence",
		scope: { kind: "selection", nodes: ["Db"], edges: [], flows: [] },
	});
	writeFileSync(join(fixture.vault, "Shop.semantic.json"), JSON.stringify(fixture.original));
	const { vault, request } = await installationFixture(fixture);
	const installed = await writes.migrateArchitectureModel(vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const before = await readArchitectureModel(vault, undefined, undefined, { bookmark: "Order" });
	if (!before.success) throw new Error(JSON.stringify(before));
	const bookmark = before.migration!.bookmark!;
	expect(bookmark.diagnostics).toEqual([]);
	expect(bookmark.reading.flow).toBe("Shop/System#Buy");
	for (const collection of before.collections) rmSync(join(vault, collection.file));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const selected = await readArchitectureModel(vault, undefined, undefined, { bookmark: "Order" });
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.migration?.bookmark?.diagnostics).toMatchObject([
		{ code: "BOOKMARK_SUBJECT_MISSING", subjects: ["Shop/System#Buy"] },
	]);
	expect(selected.migration?.bookmark?.reading).toEqual(bookmark.reading);
	const unavailable = await readArchitectureModel(vault, undefined, undefined, {
		bookmark: "Shop/System#NoFlow",
	});
	if (!unavailable.success) throw new Error(JSON.stringify(unavailable));
	expect(unavailable.migration?.bookmark?.diagnostics).toEqual(
		before.migration?.bookmarks?.find((entry) => entry.id === "Shop/System#NoFlow")?.diagnostics,
	);
	expect(unavailable.migration?.bookmark?.diagnostics).toMatchObject([{ code: "FLOW_REQUIRED" }]);
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
