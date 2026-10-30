import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveLegacyMappingPlan } from "@archboard/board/store-write";
import { readLegacyInventory } from "@archboard/board/store-read";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fixture() {
	const home = mkdtempSync(join(tmpdir(), "archboard-legacy-inventory-"));
	homes.push(home);
	const vault = join(home, ".archboard/vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	const content = {
		nodes: [
			{ id: "Api", name: "API", kind: "module", responsibility: "Accepts requests", order: 10 },
		],
		edges: [],
		flows: [],
		walkthroughs: [
			{
				id: "Talk",
				name: "Overview",
				beats: [
					{ id: "Beat", heading: "API", body: "Accepts requests", subjects: ["Api"], view: "View" },
				],
			},
		],
	};
	const document = {
		schemaVersion: "2.4.0",
		kind: "semantic-board",
		id: "Family",
		name: "Shop",
		formerNames: ["Store"],
		level: "service",
		version: 7,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		current: "Now",
		views: [{ id: "View", name: "API reading", grammar: "architecture" }],
		variants: [
			{ id: "Old", name: "Before", lifecycle: "historical", content },
			{
				id: "Now",
				name: "Implemented",
				formerNames: ["Original"],
				lifecycle: "current",
				parent: "Old",
				documents: [{ repo: "github.com/acme/shop", path: "docs/api.md", commit: "abc123" }],
				content,
			},
			{
				id: "Draft",
				name: "Next",
				lifecycle: "draft",
				parent: "Now",
				content,
				reconciliation: {
					against: "Now",
					atVersion: 6,
					base: content,
					issues: [
						{
							subject: "Api",
							what: "node",
							kind: "competing-field",
							field: "responsibility",
							mine: "One",
							theirs: "Two",
							repair: "Choose",
						},
					],
				},
			},
			{ id: "Shelf", name: "Alternative", lifecycle: "shelved", parent: "Old", content },
		],
		adoptions: [{ variant: "Now", from: "Old", at: "2026-01-02T00:00:00.000Z", reason: "Built" }],
		shelvings: [{ variant: "Shelf", at: "2026-01-02T00:00:00.000Z", reason: "Rejected" }],
	};
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(document));
	const git = Bun.spawnSync(["git", "init", "--quiet", home]);
	if (git.exitCode !== 0) throw new Error(git.stderr.toString());
	return { home, vault, document };
}

test("inventory retains complete original coverage without upgrading legacy inputs", () => {
	const { home, vault, document } = fixture();
	const original = readFileSync(join(vault, "Shop.semantic.json"), "utf8");
	const before = Bun.spawnSync(["git", "-C", home, "status", "--porcelain"]).stdout.toString();
	const result = readLegacyInventory(vault, "Shop");
	if (!result.success) throw new Error(JSON.stringify(result));
	if (result.diagnostics.length > 0) throw new Error(JSON.stringify(result.diagnostics));
	expect(result.boards).toHaveLength(1);
	expect(result.boards[0]?.source).toBe(original);
	expect(result.boards[0]?.document).toMatchObject({
		id: "Family",
		formerNames: ["Store"],
		adoptions: document.adoptions,
		shelvings: document.shelvings,
		variants: document.variants,
		views: document.views,
	});
	expect(result.identities).toContainEqual({
		id: "Shop/Family#Api",
		board: "Family",
		localId: "Api",
		kind: "node",
	});
	expect(result.identities).toContainEqual({
		id: "Shop/Family#Draft",
		board: "Family",
		localId: "Draft",
		kind: "state",
	});
	expect(result.aliases).toContainEqual({
		address: "Store@Original",
		board: "Family",
		state: "Now",
	});
	expect(result.plan).toMatchObject({
		origin: "Shop",
		sourceDigest: result.source.digest,
		mappings: [],
		choices: [],
	});
	expect(result.planRevision).toBeNull();
	expect(readFileSync(join(vault, "Shop.semantic.json"), "utf8")).toBe(original);
	expect(Bun.spawnSync(["git", "-C", home, "status", "--porcelain"]).stdout.toString()).toBe(
		before,
	);
});

test("matching names, bindings and drill-downs suggest identities without merging colliding ids", () => {
	const { vault, document } = fixture();
	const original = structuredClone(document);
	const other = structuredClone(document);
	other.id = "Other";
	other.name = "Details";
	other.formerNames = ["Old details"];
	const binding = { repo: "github.com/acme/shop", path: "src/api.ts" };
	Object.assign(original.variants[1]!.content.nodes[0]!, {
		binding,
		drillDown: { board: "Details", variant: { kind: "current" } },
	});
	Object.assign(other.variants[1]!.content.nodes[0]!, {
		binding,
		responsibility: "Stores requests",
	});
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(original));
	writeFileSync(join(vault, "Details.semantic.json"), JSON.stringify(other));
	const result = readLegacyInventory(vault, "Shop");
	if (!result.success) throw new Error(JSON.stringify(result));
	if (result.diagnostics.length > 0) throw new Error(JSON.stringify(result.diagnostics));
	expect(
		result.identities.filter((identity) => identity.kind === "node").map((identity) => identity.id),
	).toEqual(["Shop/Other#Api", "Shop/Family#Api"]);
	expect(result.evidence).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: "name", subjects: ["Shop/Other#Api", "Shop/Family#Api"] }),
			expect.objectContaining({ kind: "binding", subjects: ["Shop/Other#Api", "Shop/Family#Api"] }),
			expect.objectContaining({
				kind: "drill-down",
				subjects: ["Shop/Family#Api", "Shop/Other#Api"],
			}),
		]),
	);
	expect(result.plan.mappings).toEqual([]);
	expect(result.conflicts).toContainEqual(
		expect.objectContaining({
			kind: "definition",
			options: expect.arrayContaining([
				expect.objectContaining({
					subject: "Shop/Other#Api",
					value: expect.objectContaining({ responsibility: "Stores requests" }),
				}),
				expect.objectContaining({
					subject: "Shop/Family#Api",
					value: expect.objectContaining({ responsibility: "Accepts requests" }),
				}),
			]),
		}),
	);
	expect(result.unresolved).toContain(
		result.conflicts.find((conflict) => conflict.kind === "definition")!.key,
	);
});

test("explicit canonical choices persist separately and stale source or plan writes refuse", async () => {
	const { vault, document } = fixture();
	const other = {
		...structuredClone(document),
		id: "Other",
		name: "Details",
		formerNames: ["Old details"],
	};
	other.variants[1]!.content.nodes[0]!.responsibility = "Stores requests";
	writeFileSync(join(vault, "Details.semantic.json"), JSON.stringify(other));
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const conflict = inventory.conflicts.find((item) => item.kind === "definition")!;
	const plan = {
		...inventory.plan,
		mappings: [
			{
				legacy: "Shop/Other#Api",
				canonical: "Shop/Family#Api",
				reason: "The owner identifies one API",
			},
		],
		choices: [
			{
				conflict: conflict.key,
				reason: "Keep the implemented public definition",
				resolution: { kind: "select" as const, option: 1 },
			},
		],
	};
	const saved = await saveLegacyMappingPlan(vault, {
		plan,
		expectedPlan: null,
		doing: "Record the owner's identity choice",
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	expect(saved.plan).toEqual(plan);
	expect(saved.unresolved).not.toContain(conflict.key);
	expect(saved.planRevision).not.toBeNull();
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({
		plan,
		source: inventory.source,
		planRevision: saved.planRevision,
	});
	expect(readFileSync(join(vault, "Shop.semantic.json"), "utf8")).toBe(
		inventory.boards.find((board) => board.file === "Shop.semantic.json")!.source,
	);
	expect(
		await saveLegacyMappingPlan(vault, {
			plan: { ...plan, choices: [] },
			expectedPlan: null,
			doing: "Try a stale plan",
		}),
	).toMatchObject({ success: false, code: "MAPPING_STALE" });
	const original = join(vault, "Shop.semantic.json");
	writeFileSync(original, `${readFileSync(original, "utf8")}\n`);
	expect(
		await saveLegacyMappingPlan(vault, {
			plan,
			expectedPlan: saved.planRevision,
			doing: "Try a changed source",
		}),
	).toMatchObject({ success: false, code: "MAPPING_STALE" });
});

function conflictingContent(right: boolean) {
	return {
		nodes: [
			{
				id: right ? "ParentB" : "ParentA",
				name: right ? "Storage" : "Server",
				kind: "module",
				responsibility: "Holds modules",
				order: 1,
			},
			{
				id: "Api",
				name: "API",
				kind: right ? "missing" : "module",
				responsibility: right ? "Stores requests" : "Accepts requests",
				parent: right ? "ParentB" : "ParentA",
				order: right ? 20 : 10,
			},
			{
				id: "Db",
				name: "Database",
				kind: "module",
				responsibility: "Stores data",
				parent: right ? "ParentB" : "ParentA",
				order: right ? 10 : 20,
			},
		],
		edges: [
			{ id: "Rel", from: right ? "Db" : "Api", to: right ? "Api" : "Db", kind: "call", order: 1 },
		],
		flows: [],
		walkthroughs: [],
	};
}

test("mapping reports definition, parent, sibling order, relationship owner and policy decisions", async () => {
	const { vault, document } = fixture();
	for (const right of [false, true]) {
		const board = {
			...document,
			id: right ? "Other" : "Family",
			name: right ? "Details" : "Shop",
			formerNames: right ? ["Old details"] : ["Store"],
			views: [],
			variants: [
				{
					id: "Now",
					name: "Implemented",
					lifecycle: "current",
					content: conflictingContent(right),
				},
			],
			adoptions: undefined,
			shelvings: undefined,
		};
		writeFileSync(join(vault, `${board.name}.semantic.json`), JSON.stringify(board));
	}
	const initial = readLegacyInventory(vault, "Shop");
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const plan = {
		...initial.plan,
		mappings: ["Api", "Db", "Rel"].map((id) => ({
			legacy: `Shop/Other#${id}`,
			canonical: `Shop/Family#${id}`,
			reason: "The owner identifies one subject",
		})),
	};
	const saved = await saveLegacyMappingPlan(vault, {
		plan,
		expectedPlan: null,
		doing: "Record explicit identity mappings",
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	expect(new Set(saved.conflicts.map((conflict) => conflict.kind))).toEqual(
		new Set(["definition", "parent", "order", "relationship-owner", "policy"]),
	);
	expect(
		saved.conflicts
			.find((conflict) => conflict.kind === "relationship-owner")
			?.options.map((option) => option.value),
	).toEqual(["Shop/Family#Db", "Shop/Family#Api"]);
	const choices = saved.conflicts.map((conflict) => ({
		conflict: conflict.key,
		reason: "The owner selects the intended result",
		resolution: { kind: "select" as const, option: 0 },
	}));
	const chosen = await saveLegacyMappingPlan(vault, {
		plan: { ...saved.plan, choices },
		expectedPlan: saved.planRevision,
		doing: "Resolve the inventory decisions",
	});
	if (!chosen.success) throw new Error(JSON.stringify(chosen));
	expect(chosen.unresolved).toEqual([]);
	expect(chosen.source).toEqual(initial.source);
	expect(chosen.boards).toEqual(initial.boards);
});

test("unknown or wrong-kind canonical targets and alias chains leave the saved plan untouched", async () => {
	const { vault } = fixture();
	const initial = readLegacyInventory(vault, "Shop");
	if (!initial.success) throw new Error(JSON.stringify(initial));
	for (const mappings of [
		[{ legacy: "Shop/Family#Api", canonical: "Shop/Family#Gone", reason: "Missing" }],
		[{ legacy: "Shop/Family#Api", canonical: "Shop/Family#View", reason: "Wrong kind" }],
		[
			{ legacy: "Shop/Family#Api", canonical: "Shop/Family#Api", reason: "One" },
			{ legacy: "Shop/Family#Api", canonical: "Shop/Family#Api", reason: "Two" },
		],
		[
			{ legacy: "Shop/Family#Old", canonical: "Shop/Family#Now", reason: "One state" },
			{ legacy: "Shop/Family#Now", canonical: "Shop/Family#Draft", reason: "Another state" },
		],
	]) {
		expect(
			await saveLegacyMappingPlan(vault, {
				plan: { ...initial.plan, mappings },
				expectedPlan: null,
				doing: "Try an invalid identity decision",
			}),
		).toMatchObject({ success: false, code: "MAPPING_INVALID" });
	}
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({
		plan: initial.plan,
		planRevision: null,
	});
});

test("duplicate family namespaces never silently collapse original identities", () => {
	const { vault, document } = fixture();
	writeFileSync(
		join(vault, "Duplicate.semantic.json"),
		JSON.stringify({ ...document, name: "Duplicate" }),
	);
	const result = readLegacyInventory(vault, "Shop");
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.boards).toHaveLength(2);
	expect(result.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "DUPLICATE_NAMESPACE",
			file: "Shop.semantic.json",
			subjects: ["Shop/Family"],
		}),
	);
});
