import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SemanticBoard } from "@archboard/board/document";
import { readLegacyInventory } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint, saveLegacyMappingPlan } from "@archboard/board/store-write";
import { vaultIn } from "../../support/test-vault.ts";
import { fixtureGit, initializeSource } from "./canonical-model.ts";

/** Create explicit original views and retain their complete migration reading. */
async function legacyNavigation(root: string) {
	const vault = vaultIn(root);
	cpSync(join(import.meta.dir, "../fixtures/legacy-preview"), vault, { recursive: true });
	for (const file of [
		"Details.semantic.json",
		"Future.semantic.json",
		".archboard/migration-plan.json",
	])
		rmSync(join(vault, file));
	initializeSource(root);
	fixtureGit(root, "config", "commit.gpgsign", "false");
	const file = join(vault, "Shop.semantic.json");
	const board = JSON.parse(readFileSync(file, "utf8")) as SemanticBoard;
	board.views = [
		{
			id: "Entry",
			name: "Entry",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["Api"], edges: ["Save"], flows: [] },
		},
		{
			id: "Order",
			name: "Purchase order",
			grammar: "sequence",
			scope: { kind: "selection", nodes: [], edges: [], flows: ["Buy"] },
		},
		{
			id: "Storage",
			name: "Storage",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["Db"], edges: [], flows: [] },
		},
		{ id: "Whole", name: "Whole shop", grammar: "architecture", scope: { kind: "all" } },
	];
	const current = board.variants[0]!;
	current.content.edges.push({
		id: "Extra",
		from: "Db",
		to: "Api",
		kind: "call",
		order: 60,
		label: "Publish availability",
		emphasis: "normal",
	});
	current.content.walkthroughs = [
		{
			id: "Tour",
			name: "Buying",
			beats: [
				{
					id: "Start",
					heading: "Entry",
					body: "Accept the request",
					subjects: ["Api", "Save"],
					view: "Entry",
				},
				{
					id: "Call",
					heading: "Save",
					body: "Follow the purchase",
					subjects: ["Ask"],
					view: "Order",
				},
				{
					id: "End",
					heading: "Overview",
					body: "See the complete shop",
					subjects: [],
					view: "Whole",
				},
			],
		},
	];
	const original = structuredClone(current);
	original.id = "Old";
	original.name = "Before";
	original.lifecycle = "historical";
	original.content = {
		nodes: [
			{
				id: "Api",
				name: "Early API",
				kind: "module",
				responsibility: "Served early requests",
				order: 10,
			},
		],
		edges: [],
		flows: [],
		walkthroughs: [
			{
				id: "OldTour",
				name: "Early service",
				beats: [
					{
						id: "Early",
						heading: "Early service",
						body: "One original entry point",
						subjects: ["Api"],
						view: "Whole",
					},
				],
			},
		],
	};
	original.content.nodes[0]!.drillDown = {
		board: "Store",
		variant: { kind: "named", name: "Implemented" },
	};
	current.parent = "Old";
	board.variants = [original, current];
	writeFileSync(file, JSON.stringify(board));
	fixtureGit(root, "add", ".");
	fixtureGit(root, "commit", "--quiet", "-m", "test: seed explicit legacy navigation");
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const saved = await saveLegacyMappingPlan(vault, {
		plan: {
			...inventory.plan,
			references: [
				{
					legacy: "Shop/System#Api",
					state: "Shop/System#Old",
					reference: {
						repo: "github.com/acme/shop",
						model: "Shop",
						subject: "Shop/System#Db",
						state: "Shop/System#Now",
					},
					reason: "Open the explicit original storage state",
				},
			],
		},
		expectedPlan: inventory.planRevision,
		doing: "Keep exact original navigation",
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "migration",
		origin: "Shop",
		expectedPlan: saved.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "retain-original-navigation",
		writer: "fixture",
		doing: "Keep complete original navigation",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	return { root, vault, checkpoint: retained.checkpoint.id, original: readFileSync(file, "utf8") };
}

export { legacyNavigation };
