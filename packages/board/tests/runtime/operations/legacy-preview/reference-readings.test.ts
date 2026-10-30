import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import {
	publicationFixture,
	cleanPublicationFixtures,
} from "#tests/runtime/support/publication-fixture.ts";
import { afterEach, expect, test } from "bun:test";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { declareDirectory } from "@archboard/workspace/checkouts";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";

const homes: string[] = [];
const registry = process.env["ARCHBOARD_REPOS"];
afterEach(() => {
	cleanPublicationFixtures();
	if (registry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = registry;
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("explicit local drill-down targets follow original states through the existing reference owner", async () => {
	const { home, vault, original } = narrativeFixture();
	homes.push(home);
	process.env["ARCHBOARD_REPOS"] = join(home, "repos.json");
	const remote = Bun.spawnSync([
		"git",
		"-C",
		home,
		"remote",
		"add",
		"origin",
		"https://github.com/acme/shop.git",
	]);
	if (remote.exitCode !== 0) throw new Error(remote.stderr.toString());
	await declareDirectory(home, { choose: true });
	const current = original.variants[0]!;
	const past = { ...structuredClone(current), id: "Past", name: "Before", lifecycle: "historical" };
	past.content.nodes[2]!.responsibility = "Original storage";
	const linkedNode = {
		...current.content.nodes[1]!,
		drillDown: { board: "Store", variant: { kind: "named", name: "Before" } },
	};
	current.content.nodes[1] = linkedNode;
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify({ ...original, variants: [past, current] }),
	);
	const initial = await savePreviewPlan(vault);
	const reference = {
		repo: "github.com/acme/shop",
		model: "Shop",
		subject: "Shop/System#Db",
		state: "Shop/System#Past",
	};
	await savePreviewPlan(vault, {
		...initial.plan,
		references: [{ legacy: "Shop/System#Api", reference, reason: "Exact original storage state" }],
	});
	const result = await readArchitectureModel(vault, "Shop/System#Api", undefined, {
		preview: "Shop",
		reference: 0,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.selectedSubject).toBe("Shop/System#Db");
	expect(result.selectedModule).toBe("Shop/System#Db");
	expect(result.modules.find((entry) => entry.id === "Shop/System#Db")?.responsibility).toBe(
		"Original storage",
	);
	expect(result.migrationPreview?.selected?.legacy).toBe("Shop/System#Past");
	expect(result.location).toMatchObject({
		preview: "Shop",
		state: "Shop/System#Past",
		subject: "Shop/System#Db",
	});
});

test("an explicit local checkpoint target preserves its original source instead of requiring the newer preview source", async () => {
	const legacy = narrativeFixture();
	homes.push(legacy.home);
	const { root, vault, home } = publicationFixture();
	process.env["ARCHBOARD_REPOS"] = join(home, "repos.json");
	rmSync(vault, { recursive: true, force: true });
	cpSync(legacy.vault, vault, { recursive: true });
	await declareDirectory(root, { choose: true });
	const initial = await savePreviewPlan(vault);
	const saved = await retainArchitectureCheckpoint(vault, {
		target: "migration",
		origin: "Shop",
		expectedPlan: initial.planRevision,
		expectedRevision: initial.source.digest,
		operationId: "original-target",
		writer: "fixture",
		doing: "Retain original reference destination",
		dependencies: [],
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	const current = legacy.original.variants[0]!;
	const linkedNode = {
		...current.content.nodes[1]!,
		drillDown: { board: "Store", variant: { kind: "named", name: "Implemented" } },
	};
	current.content.nodes[1] = linkedNode;
	current.content.nodes[2]!.responsibility = "New storage meaning";
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(legacy.original));
	const observed = readLegacyInventory(vault, "Shop");
	if (!observed.success) throw new Error(JSON.stringify(observed));
	const latest = await savePreviewPlan(vault, {
		...observed.plan,
		sourceDigest: observed.source.digest,
		choices: [],
	});
	await savePreviewPlan(vault, {
		...latest.plan,
		sourceDigest: latest.source.digest,
		references: [
			{
				legacy: "Shop/System#Api",
				reference: {
					repo: "github.com/acme/shop",
					model: "Shop",
					subject: "Shop/System#Db",
					state: "Shop/System#Now",
					checkpoint: saved.checkpoint.id,
				},
				reason: "Keep exact earlier storage meaning",
			},
		],
	});
	const result = await readArchitectureModel(vault, "Shop/System#Api", undefined, {
		preview: "Shop",
		reference: 0,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.modules.find((entry) => entry.id === "Shop/System#Db")?.responsibility).toBe(
		"Stores purchases",
	);
	expect(result.location).toMatchObject({
		checkpoint: saved.checkpoint.id,
		preview: "Shop",
		state: "Shop/System#Now",
	});
});
