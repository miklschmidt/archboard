import { beforeAll, afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	retainArchitectureCheckpoint,
} from "@archboard/board/store-write";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
import {
	publicationFixture,
	cleanPublicationFixtures,
} from "#tests/runtime/support/publication-fixture.ts";

let captured: Awaited<ReturnType<typeof portableOriginals>> | undefined;
async function portableOriginals() {
	const legacy = narrativeFixture();
	const source = publicationFixture();
	rmSync(source.vault, { recursive: true, force: true });
	cpSync(legacy.vault, source.vault, { recursive: true });
	rmSync(legacy.home, { recursive: true, force: true });
	const inventory = await savePreviewPlan(source.vault);
	const preview = await readArchitectureModel(source.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "migration",
		origin: "Shop",
		expectedPlan: inventory.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "portable-originals",
		writer: "fixture",
		doing: "Retain original portable reading evidence",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	// Seed an already canonical source. Product cutover remains TASK-549.23.
	rmSync(source.vault, { recursive: true, force: true });
	cpSync(resolve("examples/canonical-model/.archboard/vault"), source.vault, { recursive: true });
	const { file: _file, ...walk } = preview.walkthroughs[0]!;
	writeFileSync(
		join(source.vault, "original.walkthrough.json"),
		JSON.stringify({ ...walk, target: { checkpoint: retained.checkpoint.id } }),
	);
	return { source, retained, inventory };
}
beforeAll(async () => {
	captured = await portableOriginals();
});
afterAll(cleanPublicationFixtures);

test("complete portable history preserves original narrative playback, bookmarks, and former addresses", async () => {
	if (captured === undefined) throw new Error("The portable original fixture is unavailable.");
	const { source, retained, inventory } = captured;
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const destination = publicationFixture();
	rmSync(destination.vault, { recursive: true, force: true });
	mkdirSync(destination.vault, { recursive: true });
	const imported = await importArchitectureModel(destination.vault, {
		bundle: exported.bundle,
		expectedRevision: {
			files: [],
			digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
		},
		operationId: "portable-original-readings",
		writer: "fixture",
		doing: "Restore complete original reading history",
	});
	if (!imported.success) throw new Error(JSON.stringify(imported));
	const reading = await readArchitectureModel(destination.vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: retained.checkpoint.id,
		legacyAddress: "Store@Implemented",
		bookmark: "Shop/System#Unused",
		walkthrough: "Shop/System#Tour",
		shared: true,
	});
	if (!reading.success) throw new Error(JSON.stringify(reading));
	expect(reading.playback).toMatchObject({
		checkpoint: retained.checkpoint.id,
		beats: [{ status: "ready" }, { status: "ready" }, { status: "ready" }],
	});
	expect(reading.migrationPreview?.originals).toEqual(inventory.boards);
	expect(reading.migrationPreview?.bookmark?.id).toBe("Shop/System#Unused");
	expect(reading.migrationPreview?.resolvedAddress?.state).toBe("Shop/System#Now");
});
