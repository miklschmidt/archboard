import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SemanticBoard } from "@archboard/board/document";
import { readLegacyInventory } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint, saveLegacyMappingPlan } from "@archboard/board/store-write";
import { vaultIn } from "../../support/test-vault.ts";
import { fixtureGit, initializeSource } from "./canonical-model.ts";

/** Create independent original histories and retain their exact inputs through public operations. */
async function legacyHistory(root: string) {
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "../fixtures/legacy-preview"), vault, { recursive: true });
	rmSync(join(vault, "Details.semantic.json"));
	rmSync(join(vault, ".archboard/migration-plan.json"));
	initializeSource(root);
	fixtureGit(root, "config", "commit.gpgsign", "false");
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: seed original architecture");
	const revision = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]);
	if (revision.exitCode !== 0) throw new Error(revision.stderr.toString());
	const commit = revision.stdout.toString().trim();
	const file = join(vault, "Shop.semantic.json");
	const board = JSON.parse(readFileSync(file, "utf8")) as SemanticBoard;
	const current = board.variants[0]!;
	const base = structuredClone(current.content);
	current.content.nodes.find((node) => node.id === "Api")!.responsibility =
		"Routes current requests";
	const old = structuredClone(current);
	old.id = "Old";
	old.name = "Before";
	old.lifecycle = "historical";
	old.content = {
		nodes: [
			{
				id: "Api",
				name: "API",
				kind: "module",
				responsibility: "Served early requests",
				order: 10,
			},
		],
		edges: [],
		flows: [],
		walkthroughs: [],
	};
	old.corrections = [
		{
			at: "2026-01-02T00:00:00.000Z",
			reason: "The early API already served requests",
			revisions: [{ repo: "github.com/acme/shop", commit }],
		},
	];
	const draft = structuredClone(current);
	draft.id = "Draft";
	draft.name = "Next";
	draft.lifecycle = "draft";
	draft.parent = "Now";
	draft.content.nodes.find((node) => node.id === "Api")!.responsibility =
		"Routes proposed requests";
	draft.reconciliation = {
		against: "Now",
		atVersion: 1,
		base,
		issues: [
			{
				subject: "Api",
				what: "node",
				kind: "competing-field",
				field: "responsibility",
				mine: "Routes proposed requests",
				theirs: "Routes current requests",
				repair: "Choose the API responsibility",
			},
		],
	};
	const child = structuredClone(draft);
	child.id = "Child";
	child.name = "Following";
	child.parent = "Draft";
	child.reconciliation = {
		against: "Draft",
		atVersion: 1,
		base: structuredClone(draft.content),
		issues: [],
		blockedBy: "Draft",
	};
	const shelf = structuredClone(current);
	shelf.id = "Shelf";
	shelf.name = "Alternative";
	shelf.lifecycle = "shelved";
	shelf.parent = "Old";
	current.parent = "Old";
	board.variants = [old, current, draft, child, shelf];
	board.adoptions = [
		{
			variant: "Now",
			from: "Old",
			at: "2026-01-03T00:00:00.000Z",
			reason: "The current API is built",
		},
	];
	board.shelvings = [
		{ variant: "Shelf", at: "2026-01-04T00:00:00.000Z", reason: "Keep the smaller implementation" },
	];
	writeFileSync(file, JSON.stringify(board));
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const plan = await saveLegacyMappingPlan(vault, {
		expectedPlan: inventory.planRevision,
		doing: "Keep explicit draft ancestry",
		plan: {
			...inventory.plan,
			drafts: [
				{
					legacy: "Shop/System#Draft",
					predecessor: "Shop/System#Now",
					baseline: { state: "Shop/System#Draft", kind: "reconciliation-base" },
					reason: "Keep the standing base",
				},
				{
					legacy: "Shop/System#Child",
					predecessor: "Shop/System#Draft",
					baseline: { state: "Shop/System#Child", kind: "reconciliation-base" },
					reason: "Keep the blocked descendant",
				},
				{
					legacy: "Shop/Future#Draft",
					predecessor: null,
					baseline: { state: null, kind: "empty" },
					reason: "Keep independent planned additions",
				},
			],
		},
	});
	if (!plan.success) throw new Error(JSON.stringify(plan));
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "migration",
		origin: "Shop",
		expectedPlan: plan.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "retain-original-history",
		writer: "fixture",
		doing: "Keep complete originals",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	return { vault, checkpoint: retained.checkpoint.id, original: readFileSync(file, "utf8") };
}

export { legacyHistory };
