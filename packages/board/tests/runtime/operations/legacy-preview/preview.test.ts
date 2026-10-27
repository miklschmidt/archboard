import { z } from "zod";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readLegacyInventory, readArchitectureModel } from "@archboard/board/store-read";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import {
	previewFixture,
	savePreviewPlan,
} from "#tests/runtime/operations/legacy-preview/fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("preview composes implemented meaning through the public reader without replacing legacy authority", async () => {
	const { home, vault } = previewFixture();
	homes.push(home);
	const inventory = await savePreviewPlan(vault);
	const before = Bun.spawnSync(["git", "-C", home, "status", "--porcelain"]).stdout.toString();
	const result = ArchitectureModelReadSchema.parse(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	);
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.roots).toEqual(["Shop/System#Shop"]);
	expect(result.modules.map((module) => module.id)).toEqual([
		"Shop/System#Shop",
		"Shop/System#Api",
		"Shop/System#Db",
	]);
	expect(result.modules[1]).toMatchObject({
		name: "API",
		responsibility: "Accepts requests",
		description: "Public entry",
		parent: "Shop/System#Shop",
		groups: ["product"],
		binding: { repo: "github.com/acme/shop", path: "src/api.ts" },
		documents: [{ repo: "github.com/acme/shop", path: "docs/design.md" }],
	});
	expect(result.relationships).toEqual([
		expect.objectContaining({
			id: "Shop/System#Save",
			from: "Shop/System#Api",
			to: "Shop/System#Db",
			label: "Stores purchases",
			emphasis: "hero",
			order: 50,
			traffic: { speed: 90, volume: 2 },
			anchor: { repo: "github.com/acme/shop", path: "src/api.ts", symbol: "save" },
		}),
	]);
	expect(result.collections[0]?.flows[0]).toMatchObject({
		id: "Shop/System#Buy",
		participants: ["Shop/System#Api", "Shop/System#Db"],
		steps: [
			{
				id: "Shop/System#Ask",
				from: "Shop/System#Api",
				to: "Shop/System#Db",
				note: "Keep the receipt",
				repeat: 2,
			},
			{
				id: "Shop/System#Choice",
				alternatives: [
					{ label: "Yes", steps: [{ id: "Shop/System#Back", kind: "return" }] },
					{
						label: "No",
						steps: [{ id: "Shop/System#Retry", steps: [{ id: "Shop/System#Again" }] }],
					},
				],
			},
		],
	});
	expect(result.migrationPreview).toMatchObject({
		origin: "Shop",
		source: inventory.source,
		planRevision: inventory.planRevision,
		plannedBoards: [
			{
				board: "Future",
				states: [{ legacy: "Shop/Future#Draft", canonical: "Shop/Future#Draft" }],
			},
		],
	});
	expect(result.modules.every((module) => !("level" in module) && !("depth" in module))).toBe(true);
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	for (const board of inventory.boards)
		expect(readFileSync(join(vault, board.file), "utf8")).toBe(board.source);
	expect(Bun.spawnSync(["git", "-C", home, "status", "--porcelain"]).stdout.toString()).toBe(
		before,
	);
});

test("explicit mappings compose one definition, relationship owner and chosen sibling order", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const other = structuredClone(board);
	other.id = "Other";
	other.name = "Details";
	other.formerNames = ["Old details"];
	const content = other.variants[0]!.content;
	content.nodes[1]!.name = "Gateway";
	content.nodes[1]!.responsibility = "Alternate definition";
	content.nodes[1]!.order = 40;
	content.edges[0]!.from = "Db";
	content.edges[0]!.to = "Api";
	content.flows = [];
	writeFileSync(join(vault, "Details.semantic.json"), JSON.stringify(other));
	const initial = await savePreviewPlan(vault);
	const mapped = await savePreviewPlan(vault, {
		...initial.plan,
		mappings: ["Shop", "Api", "Db", "Save"].map((id) => ({
			legacy: `Shop/Other#${id}`,
			canonical: `Shop/System#${id}`,
			reason: "One implemented subject",
		})),
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({ success: false, code: "MAPPING_UNRESOLVED" });
	await savePreviewPlan(vault, {
		...mapped.plan,
		choices: mapped.conflicts.map((conflict) => ({
			conflict: conflict.key,
			reason: "Keep the public definition and detailed order",
			resolution: {
				kind: "select",
				option: conflict.options.findIndex(
					(option) =>
						option.file ===
						(conflict.kind === "order" ? "Details.semantic.json" : "Shop.semantic.json"),
				),
			},
		})),
	});
	const result = await readArchitectureModel(vault, "Gateway", undefined, { preview: "Shop" });
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.selectedModule).toBe("Shop/System#Api");
	expect(result.modules.map((module) => module.id)).toEqual([
		"Shop/System#Shop",
		"Shop/System#Db",
		"Shop/System#Api",
	]);
	expect(result.modules.find((module) => module.id === "Shop/System#Api")).toMatchObject({
		name: "API",
		formerNames: ["Gateway"],
		responsibility: "Accepts requests",
	});
	expect(result.relationships).toHaveLength(1);
	expect(result.relationships[0]).toMatchObject({
		id: "Shop/System#Save",
		from: "Shop/System#Api",
		to: "Shop/System#Db",
	});
});

test("current drill-downs require explicit subject and state mappings rather than inferred roots", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const content = board.variants[0]!.content;
	Object.assign(content.nodes[1]!, {
		drillDown: { board: "Next shop", variant: { kind: "named", name: "Next" } },
	});
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const inventory = await savePreviewPlan(vault);
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({
		success: false,
		code: "MAPPING_UNRESOLVED",
		diagnostics: [expect.objectContaining({ subjects: ["Shop/System#Api"] })],
	});
	const reference = {
		repo: "github.com/acme/shop",
		model: "Shop",
		subject: "Shop/Future#Api",
		state: "Draft",
	};
	await savePreviewPlan(vault, {
		...inventory.plan,
		references: [
			{ legacy: "Shop/System#Api", reference, reason: "Open the intended future subject" },
		],
	});
	const result = await readArchitectureModel(vault, "Shop/System#Api", "Shop/System#Buy", {
		preview: "Shop",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.modules.find((module) => module.id === "Shop/System#Api")?.references).toEqual([
		reference,
	]);
	expect(result.selectedFlow).toBe("Shop/System#Buy");
	expect(result.modules.some((module) => module.id.startsWith("Shop/Future#"))).toBe(false);
});

test("mapped flows preserve one explicit recursive definition and retain collection provenance", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const other = structuredClone(board);
	other.id = "Other";
	other.name = "Details";
	other.formerNames = ["Old details"];
	other.variants[0]!.content.flows[0]!.name = "Checkout";
	other.variants[0]!.content.flows[0]!.steps[0]!.label = "alternate save";
	writeFileSync(join(vault, "Details.semantic.json"), JSON.stringify(other));
	const initial = await savePreviewPlan(vault);
	const mapped = await savePreviewPlan(vault, {
		...initial.plan,
		mappings: ["Shop", "Api", "Db", "Save", "Buy", "Ask", "Choice", "Back", "Retry", "Again"].map(
			(id) => ({
				legacy: `Shop/Other#${id}`,
				canonical: `Shop/System#${id}`,
				reason: "One subject across readings",
			}),
		),
	});
	const conflict = mapped.conflicts.find((conflict) =>
		conflict.options.some((option) => option.subject === "Shop/Other#Buy"),
	);
	expect(conflict).toBeDefined();
	await savePreviewPlan(vault, {
		...mapped.plan,
		choices: mapped.conflicts.map((conflict) => ({
			conflict: conflict.key,
			reason: "Keep implemented purchase behavior",
			resolution: {
				kind: "select",
				option: conflict.options.findIndex((option) => option.file === "Shop.semantic.json"),
			},
		})),
	});
	const result = await readArchitectureModel(vault, undefined, "Checkout", { preview: "Shop" });
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.selectedFlow).toBe("Shop/System#Buy");
	expect(result.collections.flatMap((collection) => collection.flows)).toHaveLength(1);
	expect(result.collections.find((collection) => collection.flows.length > 0)).toMatchObject({
		id: "System",
		flows: [
			{
				id: "Shop/System#Buy",
				name: "Purchase",
				formerNames: ["Checkout"],
				steps: [{ id: "Shop/System#Ask", label: "save" }, expect.anything()],
			},
		],
	});
});

test("policy choices supply one complete candidate vocabulary without modifying the source policy", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	board.variants[0]!.content.nodes[1]!.kind = "gateway";
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const inventory = await savePreviewPlan(vault);
	const policy = {
		...inventory.policy!,
		nodeKinds: {
			...inventory.policy!.nodeKinds,
			gateway: { name: "Gateway", icon: "RiServerLine" },
		},
	};
	const saved = await savePreviewPlan(vault, {
		...inventory.plan,
		choices: inventory.conflicts.map((conflict) => ({
			conflict: conflict.key,
			reason: "Define the original gateway kind",
			resolution: { kind: "value", value: z.json().parse(policy) },
		})),
	});
	const result = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.policy.nodeKinds["gateway"]).toEqual({ name: "Gateway", icon: "RiServerLine" });
	expect(result.modules.find((module) => module.id === "Shop/System#Api")?.kind).toBe("gateway");
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({
		source: saved.source,
		policy: inventory.policy,
	});
});

test("preview refuses absent plans, stale source, incompatible selectors and incoherent mapped parents", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({ success: false, code: "MAPPING_REQUIRED" });
	const saved = await savePreviewPlan(vault);
	for (const selection of [{ state: "current" }, { compare: true }, { against: "current" }]) {
		expect(
			await readArchitectureModel(vault, undefined, undefined, { preview: "Shop", ...selection }),
		).toMatchObject({ success: false, code: "MODEL_INVALID" });
	}
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		`${readFileSync(join(vault, "Shop.semantic.json"), "utf8")}\n`,
	);
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({ success: false, code: "MAPPING_STALE" });
	const fresh = readLegacyInventory(vault, "Shop");
	if (!fresh.success) throw new Error(JSON.stringify(fresh));
	await savePreviewPlan(vault, {
		...fresh.plan,
		sourceDigest: fresh.source.digest,
		mappings: [
			{
				legacy: "Shop/System#Shop",
				canonical: "Shop/System#Api",
				reason: "Test an incoherent containment choice",
			},
		],
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({ success: false, code: "MAPPING_UNRESOLVED" });
	const mapped = readLegacyInventory(vault, "Shop");
	if (!mapped.success) throw new Error(JSON.stringify(mapped));
	await savePreviewPlan(vault, {
		...mapped.plan,
		choices: mapped.conflicts.map((conflict) => ({
			conflict: conflict.key,
			reason: "Choose a cycle deliberately",
			resolution: {
				kind: "select",
				option: conflict.options.findIndex((option) =>
					conflict.kind === "parent"
						? option.value === "Shop/System#Api"
						: option.subject === "Shop/System#Api",
				),
			},
		})),
	});
	const invalid = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	expect(invalid).toMatchObject({
		success: false,
		code: "MODEL_INVALID",
		diagnostics: expect.arrayContaining([expect.objectContaining({ code: "CONTAINMENT_CYCLE" })]),
	});
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({ source: fresh.source });
	expect(saved.boards.find((entry) => entry.file === "Shop.semantic.json")?.source).toBe(
		JSON.stringify(board, null, 2),
	);
});
