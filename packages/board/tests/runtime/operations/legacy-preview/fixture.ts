import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { readLegacyInventory } from "@archboard/board/store-read";
import { saveLegacyMappingPlan } from "@archboard/board/store-write";
import type { LegacyMappingPlan } from "#shared/schemas/migration.ts";

function previewFixture() {
	const home = mkdtempSync(join(tmpdir(), "archboard-migration-preview-"));
	const vault = join(home, ".archboard/vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(
		join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({
			...DEFAULT_SEMANTIC_POLICY,
			groups: { product: { name: "Product", color: "blue" } },
		}),
	);
	const board = {
		schemaVersion: "2.4.0",
		kind: "semantic-board",
		id: "System",
		name: "Shop",
		formerNames: ["Store"],
		level: "system",
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		current: "Now",
		views: [],
		variants: [
			{
				id: "Now",
				name: "Implemented",
				lifecycle: "current",
				summary: "Shop architecture",
				documents: [{ repo: "github.com/acme/shop", path: "docs/design.md" }],
				content: {
					nodes: [
						{
							id: "Shop",
							name: "Shop",
							kind: "system",
							responsibility: "Serves shoppers",
							order: 10,
						},
						{
							id: "Api",
							name: "API",
							kind: "module",
							responsibility: "Accepts requests",
							description: "Public entry",
							parent: "Shop",
							groups: ["product"],
							order: 20,
							binding: { repo: "github.com/acme/shop", path: "src/api.ts" },
						},
						{
							id: "Db",
							name: "Database",
							kind: "module",
							responsibility: "Stores purchases",
							parent: "Shop",
							order: 30,
						},
					],
					edges: [
						{
							id: "Save",
							from: "Api",
							to: "Db",
							kind: "call",
							label: "Stores purchases",
							description: "Durable write",
							emphasis: "hero",
							traffic: { speed: 90, volume: 2 },
							order: 50,
							anchor: { repo: "github.com/acme/shop", path: "src/api.ts", symbol: "save" },
						},
					],
					flows: [
						{
							id: "Buy",
							name: "Purchase",
							summary: "Save a purchase",
							participants: ["Api", "Db"],
							steps: [
								{
									id: "Ask",
									kind: "sync",
									from: "Api",
									to: "Db",
									label: "save",
									note: "Keep the receipt",
									repeat: 2,
								},
								{
									id: "Choice",
									kind: "decision",
									question: "Saved?",
									alternatives: [
										{
											label: "Yes",
											steps: [
												{ id: "Back", kind: "return", from: "Db", to: "Api", label: "receipt" },
											],
										},
										{
											label: "No",
											steps: [
												{
													id: "Retry",
													kind: "loop",
													condition: "Until saved",
													steps: [
														{ id: "Again", kind: "sync", from: "Api", to: "Db", label: "retry" },
													],
												},
											],
										},
									],
								},
							],
						},
					],
					walkthroughs: [],
				},
			},
		],
	};
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board, null, 2));
	const { current: _current, formerNames: _formerNames, ...planned } = structuredClone(board);
	planned.id = "Future";
	planned.name = "Next shop";
	planned.variants = [{ ...planned.variants[0]!, id: "Draft", name: "Next", lifecycle: "draft" }];
	writeFileSync(join(vault, "Future.semantic.json"), JSON.stringify(planned));
	const result = Bun.spawnSync(["git", "init", "--quiet", home]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return { home, vault, board, planned };
}

async function savePreviewPlan(vault: string, plan?: LegacyMappingPlan) {
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const saved = await saveLegacyMappingPlan(vault, {
		plan: plan ?? inventory.plan,
		expectedPlan: inventory.planRevision,
		doing: "Preview explicit migration choices",
	});
	if (!saved.success)
		throw new Error(JSON.stringify({ saved, diagnostics: inventory.diagnostics }));
	return saved;
}
export { previewFixture, savePreviewPlan };
