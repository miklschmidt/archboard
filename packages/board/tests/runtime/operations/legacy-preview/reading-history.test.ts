import { afterEach, expect, test } from "bun:test";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
} from "#tests/runtime/support/publication-fixture.ts";

const homes: string[] = [];
afterEach(() => {
	cleanPublicationFixtures();
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("retained preview playback and former addresses use exact original bytes after live inputs disappear", async () => {
	const legacy = narrativeFixture();
	homes.push(legacy.home);
	const { root, vault } = publicationFixture();
	rmSync(vault, { recursive: true, force: true });
	cpSync(legacy.vault, vault, { recursive: true });
	const inventory = await savePreviewPlan(vault);
	const saved = await retainArchitectureCheckpoint(vault, {
		target: "migration",
		origin: "Shop",
		expectedPlan: inventory.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "reading-history",
		writer: "fixture",
		doing: "Retain original narrative and addresses",
		dependencies: [],
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	expect(git(root, "verify-commit", saved.checkpoint.id)).toBe("");
	for (const { file } of inventory.boards) rmSync(join(vault, file));
	rmSync(join(vault, ".archboard/migration-plan.json"));
	const result = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: saved.checkpoint.id,
		legacyAddress: "Store@Implemented",
		walkthrough: "Shop/System#Tour",
		shared: true,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.playback).toMatchObject({
		checkpoint: saved.checkpoint.id,
		revision: result.revision,
		source: {
			preview: "Shop",
			checkpoint: saved.checkpoint.id,
			state: "Shop/System#Now",
			shared: true,
		},
		beats: [{ status: "ready" }, { status: "ready" }, { status: "ready" }],
	});
	expect(result.migrationPreview?.selected).toMatchObject({
		legacy: "Shop/System#Now",
		completeModel: false,
	});
	expect(result.migrationPreview?.originals).toEqual(inventory.boards);
	expect(ArchitectureModelReadSchema.safeParse(result).success).toBe(true);
});

test("historical drill-downs never reuse a current mapping for another original state", async () => {
	const { home, vault, original } = narrativeFixture();
	homes.push(home);
	const current = original.variants[0]!;
	const past = { ...structuredClone(current), id: "Past", name: "Before", lifecycle: "historical" };
	const historicalNode = {
		...past.content.nodes[1]!,
		drillDown: { board: "Old store", variant: { kind: "named", name: "Before" } },
	};
	past.content.nodes[1] = historicalNode;
	const currentNode = {
		...current.content.nodes[1]!,
		drillDown: { board: "New store", variant: { kind: "current" } },
	};
	current.content.nodes[1] = currentNode;
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify({ ...original, variants: [past, current] }),
	);
	const initial = await savePreviewPlan(vault);
	const reference = {
		repo: "github.com/acme/foreign",
		model: "Foreign",
		subject: "Foreign#Store",
		state: "current",
	};
	await savePreviewPlan(vault, {
		...initial.plan,
		references: [{ legacy: "Shop/System#Api", reference, reason: "Current navigation only" }],
	});
	const result = await readArchitectureModel(vault, "Shop/System#Api", undefined, {
		preview: "Shop",
		state: "Shop/System#Past",
		references: true,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(
		result.modules.find((entry) => entry.id === "Shop/System#Api")?.references,
	).toBeUndefined();
	expect(result.migrationPreview?.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ code: "REFERENCE_UNAVAILABLE", subjects: ["Shop/System#Api"] }),
		]),
	);
});
