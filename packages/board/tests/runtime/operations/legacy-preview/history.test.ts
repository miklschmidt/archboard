import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import {
	previewFixture,
	savePreviewPlan,
} from "#tests/runtime/operations/legacy-preview/fixture.ts";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("legacy historical readings keep their board coverage without current surroundings", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const original = structuredClone(board.variants[0]!);
	original.id = "Old";
	original.name = "Before";
	original.lifecycle = "historical";
	original.content = {
		...original.content,
		nodes: [
			{ id: "Past", name: "Old API", kind: "module", responsibility: "Served requests", order: 10 },
		],
		edges: [],
		flows: [],
	};
	board.variants.push(original);
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	await savePreviewPlan(vault);
	const before = readFileSync(join(vault, "Shop.semantic.json"));
	const result = ArchitectureModelReadSchema.parse(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			state: "Shop/System#Old",
		}),
	);
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.modules.map((module) => module.id)).toEqual(["Shop/System#Past"]);
	expect(result.manifest.current).toBeNull();
	expect(result.selectedState).toMatchObject({
		id: "Old",
		name: "Before",
		lifecycle: "historical",
	});
	expect(result.migrationPreview).toMatchObject({
		selected: {
			legacy: "Shop/System#Old",
			board: "System",
			file: "Shop.semantic.json",
			completeModel: false,
		},
	});
	expect(readFileSync(join(vault, "Shop.semantic.json"))).toEqual(before);
});

test("migration retention saves unresolved original bytes and retries without changing source authority", async () => {
	const { home, vault } = previewFixture();
	homes.push(home);
	Bun.spawnSync(["git", "-C", home, "config", "user.name", "Migration fixture"]);
	Bun.spawnSync(["git", "-C", home, "config", "user.email", "fixture@example.com"]);
	Bun.spawnSync(["git", "-C", home, "config", "commit.gpgsign", "false"]);
	writeFileSync(
		join(vault, "Unresolved.semantic.json"),
		'{"schemaVersion":"99.0.0","unknown":"retain me"}\n',
	);
	const { readLegacyInventory } = await import("@archboard/board/store-read");
	const { retainArchitectureCheckpoint } = await import("@archboard/board/store-write");
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const before = inventory.boards.map(
		(entry) => [entry.file, readFileSync(join(vault, entry.file))] as const,
	);
	const request = {
		target: "migration" as const,
		origin: "Shop",
		expectedPlan: null,
		expectedRevision: inventory.source.digest,
		operationId: "retain-originals",
		writer: "fixture",
		doing: "Retain unresolved legacy originals",
		dependencies: [],
	};
	const saved = await retainArchitectureCheckpoint(vault, request);
	if (!saved.success) throw new Error(JSON.stringify(saved));
	expect(saved.checkpoint.migration).toMatchObject({
		origin: "Shop",
		source: inventory.source,
		planRevision: null,
	});
	for (const [file, bytes] of before) expect(readFileSync(join(vault, file))).toEqual(bytes);
	writeFileSync(join(vault, "Unresolved.semantic.json"), "{}");
	const retried = await retainArchitectureCheckpoint(vault, request);
	expect(retried).toEqual(saved);
	const reading = ArchitectureModelReadSchema.parse(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			checkpoint: saved.checkpoint.id,
		}),
	);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(
		reading.migrationPreview?.originals?.find((entry) => entry.file === "Unresolved.semantic.json")
			?.source,
	).toBe('{"schemaVersion":"99.0.0","unknown":"retain me"}\n');
	expect(reading.modules).toEqual([]);
	expect(reading.migrationPreview?.diagnostics?.length).toBeGreaterThan(0);
});

test("original history keeps unpinned code and external architecture unavailable", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	Object.assign(board.variants[0]!.content.nodes[1]!, {
		drillDown: { board: "External", variant: { kind: "named", name: "current" } },
	});
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...saved.plan,
		references: [
			{
				legacy: "Shop/System#Api",
				reference: {
					repo: "github.com/acme/foreign",
					model: "Other",
					subject: "Other#Api",
					state: "current",
				},
				reason: "Retain the original unresolved target",
			},
		],
	});
	const result = await readArchitectureModel(vault, "Shop/System#Api", undefined, {
		preview: "Shop",
		state: "Shop/System#Now",
		code: true,
		references: true,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.codeTarget).toMatchObject({ ok: false });
	expect(result.resolvedReferences).toEqual([
		expect.objectContaining({
			status: "unavailable",
			reference: {
				repo: "github.com/acme/foreign",
				model: "Other",
				subject: "Other#Api",
				state: "current",
			},
			diagnostics: [expect.objectContaining({ code: "REFERENCE_UNAVAILABLE" })],
		}),
	]);
});
