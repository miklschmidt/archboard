import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("preview converts complete stable narrative readings and keeps only unused views as content-free bookmarks", async () => {
	const { vault, home } = narrativeFixture();
	homes.push(home);
	await savePreviewPlan(vault);
	const bytes = readFileSync(join(vault, "Shop.semantic.json"));
	const result = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.walkthroughs).toHaveLength(1);
	expect(result.walkthroughs[0]).toMatchObject({
		id: "Shop/System#Tour",
		target: { state: "current" },
		summary: "How a purchase lands",
		beats: [
			{
				id: "Shop/System#Start",
				title: "Entry",
				narrative: "Accept the request",
				reading: {
					grammar: "architecture",
					selection: ["Shop/System#Api", "Shop/System#Save"],
					visibility: {
						modules: ["Shop/System#Api", "Shop/System#Db"],
						relationships: ["Shop/System#Save"],
						flows: [],
					},
				},
			},
			{
				id: "Shop/System#Call",
				reading: { grammar: "sequence", flow: "Shop/System#Buy", selection: ["Shop/System#Ask"] },
			},
			{
				id: "Shop/System#End",
				reading: {
					grammar: "sequence",
					flow: "Shop/System#Buy",
					focus: ["Shop/System#Api", "Shop/System#Db"],
					selection: [],
					filters: { relationships: [], groups: [] },
				},
			},
		],
	});
	expect(result.migrationPreview).toMatchObject({
		bookmarks: [
			{
				id: "Shop/System#Unused",
				name: "Storage",
				summary: "Inspect storage",
				reading: { grammar: "architecture" },
			},
		],
	});
	expect(ArchitectureModelReadSchema.safeParse(result).success).toBe(true);
	expect(readFileSync(join(vault, "Shop.semantic.json"))).toEqual(bytes);
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
});

test("preview playback captures one converted model and reports unavailable beats without retargeting", async () => {
	const { vault, original, home } = narrativeFixture();
	homes.push(home);
	original.views.push({
		id: "Empty",
		name: "No flow",
		grammar: "sequence",
		scope: { kind: "selection", nodes: ["Api"], edges: [], flows: [] },
	});
	original.variants[0]!.content.walkthroughs[0]!.beats.push({
		id: "Lost",
		heading: "Missing view",
		body: "Keep the missing reading explicit",
		subjects: [],
		view: "Empty",
	});
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(original));
	await savePreviewPlan(vault);
	const result = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		walkthrough: "Shop/System#Tour",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.playback).toMatchObject({
		source: { preview: "Shop", walkthrough: "Shop/System#Tour" },
		sourceRevision: result.revision,
		revision: result.revision,
		beats: [
			{ id: "Shop/System#Start", status: "ready" },
			{ id: "Shop/System#Call", status: "ready" },
			{ id: "Shop/System#End", status: "ready" },
			{ id: "Shop/System#Lost", status: "unavailable", diagnostics: [{ code: "FLOW_REQUIRED" }] },
		],
	});
	expect(ArchitectureModelReadSchema.safeParse(result).success).toBe(true);
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			walkthrough: "Buying",
			shared: true,
		}),
	).toMatchObject({ success: false, code: "CHECKPOINT_REQUIRED" });
	const historical = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		state: "Shop/System#Now",
		walkthrough: "Buying",
	});
	if (!historical.success) throw new Error(JSON.stringify(historical));
	expect(historical.playback).toMatchObject({
		source: { preview: "Shop", state: "Shop/System#Now" },
		walkthrough: { target: { state: "Shop/System#Now" } },
	});
	expect(historical.migrationPreview?.selected?.legacy).toBe("Shop/System#Now");
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			walkthrough: "Buyin",
		}),
	).toMatchObject({ success: false, code: "WALKTHROUGH_NOT_FOUND" });
});

test("explicit original addresses and optional bookmarks resolve exact captured identities", async () => {
	const { vault, home } = narrativeFixture();
	homes.push(home);
	await savePreviewPlan(vault);
	const result = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		legacyAddress: "Store@Implemented",
		bookmark: "Shop/System#Unused",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.migrationPreview).toMatchObject({
		selected: { legacy: "Shop/System#Now", completeModel: false },
		resolvedAddress: {
			address: "Store@Implemented",
			board: "System",
			state: "Shop/System#Now",
			canonical: "Shop/System#Now",
		},
		bookmark: {
			id: "Shop/System#Unused",
			reading: { visibility: { modules: ["Shop/System#Db"], relationships: [], flows: [] } },
		},
	});
	expect(ArchitectureModelReadSchema.safeParse(result).success).toBe(true);
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			legacyAddress: "Store@Implemente",
		}),
	).toMatchObject({ success: false, code: "LEGACY_ADDRESS_NOT_FOUND" });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			legacyAddress: "Store@Implemented",
			state: "Shop/Future#Draft",
		}),
	).toMatchObject({ success: false, code: "TARGET_CHANGED" });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			bookmark: "Shop/System#Entry",
		}),
	).toMatchObject({ success: false, code: "BOOKMARK_NOT_FOUND" });
	expect(
		await readArchitectureModel(vault, undefined, undefined, {
			legacyAddress: "Store@Implemented",
		}),
	).toMatchObject({ success: false, code: "MODEL_INVALID" });
});

test("mapped current readings retain former names while original state playback keeps its own namespace and content", async () => {
	const { home, vault, original } = narrativeFixture();
	homes.push(home);
	const old = structuredClone(original.variants[0]!);
	old.id = "Past";
	old.name = "Before";
	old.lifecycle = "historical";
	old.content.nodes[1]!.name = "Former API";
	old.content.flows[0]!.name = "Former purchase";
	old.content.walkthroughs[0]!.name = "Former tour";
	const current = { ...original.variants[0]!, parent: "Past" };
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify({ ...original, variants: [old, current] }),
	);
	const saved = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...saved.plan,
		mappings: [
			{
				legacy: "Shop/System#Api",
				canonical: "Shop/Future#Api",
				reason: "Keep the chosen stable module identity",
			},
		],
	});
	const result = await readArchitectureModel(vault, "Former API", undefined, {
		preview: "Shop",
		walkthrough: "Former tour",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.selectedModule).toBe("Shop/Future#Api");
	expect(result.modules.find((entry) => entry.id === result.selectedModule)?.formerNames).toContain(
		"Former API",
	);
	expect(result.collections[0]?.flows[0]?.formerNames).toContain("Former purchase");
	expect(result.playback?.walkthrough.beats[0]?.reading.selection).toEqual([
		"Shop/Future#Api",
		"Shop/System#Save",
	]);
	const historical = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		state: "Shop/System#Past",
		walkthrough: "Shop/System#Tour",
	});
	if (!historical.success) throw new Error(JSON.stringify(historical));
	expect(historical.modules.find((entry) => entry.id === "Shop/System#Api")?.name).toBe(
		"Former API",
	);
	expect(historical.playback?.walkthrough).toMatchObject({
		name: "Former tour",
		target: { state: "Shop/System#Past" },
		beats: [
			{ reading: { selection: ["Shop/System#Api", "Shop/System#Save"] } },
			expect.anything(),
			expect.anything(),
		],
	});
});

test("combining distinct original narratives never silently replaces one definition", async () => {
	const { home, vault, original } = narrativeFixture();
	homes.push(home);
	const other = {
		...structuredClone(original),
		id: "Other",
		name: "Other shop",
		formerNames: ["Other store"],
	};
	for (const node of other.variants[0]!.content.nodes) {
		node.name += " other";
		if ("binding" in node) node.binding.path = "src/other.ts";
	}
	other.variants[0]!.content.walkthroughs[0]!.beats[0]!.body = "A different original explanation";
	writeFileSync(join(vault, "Other.semantic.json"), JSON.stringify(other));
	const initial = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...initial.plan,
		mappings: [
			{
				legacy: "Shop/Other#Tour",
				canonical: "Shop/System#Tour",
				reason: "Test explicit narrative identity collision",
			},
		],
	});
	expect(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	).toMatchObject({ success: false, code: "MAPPING_INVALID" });
});

test("original current coverage retains its predecessor names without borrowing predecessor content", async () => {
	const { home, vault, original } = narrativeFixture();
	homes.push(home);
	const old = {
		...structuredClone(original.variants[0]!),
		id: "Past",
		name: "Before",
		lifecycle: "historical",
	};
	old.content.nodes[1]!.name = "Former API";
	old.content.nodes[1]!.responsibility = "Historical request handling";
	const current = { ...original.variants[0]!, parent: "Past" };
	const { view: _view, ...opening } = current.content.walkthroughs[0]!.beats[0]!;
	current.content.walkthroughs[0]!.beats[0] = opening;
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify({ ...original, variants: [old, current] }),
	);
	await savePreviewPlan(vault);
	const result = await readArchitectureModel(vault, "Former API", undefined, {
		preview: "Shop",
		legacyAddress: "Store@Implemented",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.walkthroughs[0]?.beats[0]?.reading).toMatchObject({
		grammar: "architecture",
		focus: [],
		filters: { relationships: [], groups: [] },
	});
	expect(result.selectedModule).toBe("Shop/System#Api");
	expect(result.modules.find((entry) => entry.id === result.selectedModule)?.responsibility).toBe(
		"Accepts requests",
	);
});
