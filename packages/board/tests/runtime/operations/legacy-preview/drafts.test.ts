import { afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
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

test("draft conversion requires explicit exact baselines and keeps same-named planning proposals independent", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const draft = {
		...structuredClone(board.variants[0]!),
		id: "Draft",
		name: "Next",
		lifecycle: "draft",
		parent: "Now",
	};
	draft.content.nodes[1]!.responsibility = "Routes requests";
	board.variants.push(draft);
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(vault);
	const initial = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!initial.success) throw new Error(JSON.stringify(initial));
	expect(
		initial.migrationPreview?.history
			?.filter((entry) => entry.state.lifecycle === "draft")
			.map((entry) => entry.conversion),
	).toEqual([undefined, undefined]);
	await savePreviewPlan(vault, {
		...saved.plan,
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Now",
				baseline: { state: "Shop/System#Now", kind: "content" },
				reason: "Preserve the exact original parent",
			},
			{
				legacy: "Shop/Future#Draft",
				predecessor: null,
				baseline: { state: null, kind: "empty" },
				reason: "Keep the planning root separate",
			},
		],
	});
	const result = ArchitectureModelReadSchema.parse(
		await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" }),
	);
	if (!result.success) throw new Error(JSON.stringify(result));
	const drafts = result.migrationPreview!.history!.filter(
		(entry) => entry.state.lifecycle === "draft",
	);
	expect(drafts.map((entry) => entry.legacy)).toEqual(["Shop/Future#Draft", "Shop/System#Draft"]);
	expect(drafts[1]?.conversion?.changes).toEqual([
		{
			type: "assign",
			subject: "Shop/System#Api",
			field: "responsibility",
			value: "Routes requests",
		},
	]);
	expect(drafts[0]?.conversion?.changes).toContainEqual(
		expect.objectContaining({ type: "add", subject: "Shop/Future#Api", kind: "module" }),
	);
	expect(result.modules.some((module) => module.id.startsWith("Shop/Future#"))).toBe(false);
});

test("standing drafts use the retained conflict base and preserve lifecycle and correction evidence", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const parent = board.variants[0]!;
	const baseline = structuredClone(parent.content);
	parent.content.nodes[1]!.responsibility = "New parent";
	const draft = {
		...structuredClone(parent),
		id: "Draft",
		name: "Next",
		lifecycle: "draft",
		parent: "Now",
		reconciliation: {
			against: "Now",
			atVersion: 1,
			base: baseline,
			issues: [
				{
					subject: "Api",
					what: "node",
					kind: "competing-field",
					field: "responsibility",
					mine: "Draft answer",
					theirs: "New parent",
					repair: "Choose an answer",
				},
			],
		},
	};
	draft.content.nodes[1]!.responsibility = "Draft answer";
	const historical = {
		...structuredClone(parent),
		id: "Old",
		name: "Old",
		lifecycle: "historical",
		corrections: [
			{
				at: "2026-01-02T00:00:00.000Z",
				reason: "Correct the original description",
				revisions: [{ repo: "github.com/acme/shop", commit: "a".repeat(40) }],
			},
		],
	};
	const shelf = {
		...structuredClone(parent),
		id: "Shelf",
		name: "Alternative",
		lifecycle: "shelved",
		parent: "Old",
	};
	const document = {
		...board,
		variants: [historical, parent, draft, shelf],
		adoptions: [{ variant: "Now", from: "Old", at: "2026-01-03T00:00:00.000Z", reason: "Built" }],
		shelvings: [
			{ variant: "Shelf", at: "2026-01-04T00:00:00.000Z", reason: "Keep the smaller design" },
		],
	};
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(document));
	const saved = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...saved.plan,
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Now",
				baseline: { state: "Shop/System#Draft", kind: "reconciliation-base" },
				reason: "Retain the standing base",
			},
		],
	});
	const result = ArchitectureModelReadSchema.parse(
		await readArchitectureModel(vault, undefined, undefined, {
			preview: "Shop",
			state: "Shop/System#Draft",
		}),
	);
	if (!result.success) throw new Error(JSON.stringify(result));
	const history = result.migrationPreview!.history!;
	expect(history.find((entry) => entry.legacy === "Shop/System#Draft")).toMatchObject({
		state: { reconciliation: draft.reconciliation },
		conversion: {
			changes: [
				{
					type: "assign",
					subject: "Shop/System#Api",
					field: "responsibility",
					value: "Draft answer",
				},
			],
		},
	});
	expect(history.find((entry) => entry.legacy === "Shop/System#Old")?.state.corrections).toEqual(
		historical.corrections,
	);
	expect(history.find((entry) => entry.legacy === "Shop/System#Now")?.adoptions).toEqual(
		document.adoptions,
	);
	expect(history.find((entry) => entry.legacy === "Shop/System#Shelf")?.shelvings).toEqual(
		document.shelvings,
	);
});

test("invented predecessors and baseline substitutions refuse without changing saved choices", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const draft = {
		...structuredClone(board.variants[0]!),
		id: "Draft",
		name: "Next",
		lifecycle: "draft",
		parent: "Now",
	};
	board.variants.push(draft);
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(vault);
	const { saveLegacyMappingPlan } = await import("@archboard/board/store-write");
	const mapping = {
		legacy: "Shop/System#Draft",
		predecessor: "Shop/System#Now",
		baseline: { state: "Shop/System#Now", kind: "content" as const },
		reason: "Keep original ancestry",
	};
	for (const wrong of [
		{ ...mapping, predecessor: "Shop/Future#Draft" },
		{ ...mapping, baseline: { kind: "content" as const, state: "Shop/Future#Draft" } },
		{ ...mapping, baseline: { kind: "empty" as const, state: null } },
	]) {
		const answer = await saveLegacyMappingPlan(vault, {
			plan: { ...saved.plan, drafts: [wrong] },
			expectedPlan: saved.planRevision,
			doing: "Try an incorrect mapping",
		});
		expect(answer).toMatchObject({ success: false, code: "MAPPING_INVALID" });
	}
	const { readLegacyInventory } = await import("@archboard/board/store-read");
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({
		planRevision: saved.planRevision,
		plan: saved.plan,
	});
});

test("draft conversion applies explicit subject mappings while original coverage retains its identities", async () => {
	const { home, vault, board } = previewFixture();
	homes.push(home);
	const draft = {
		...structuredClone(board.variants[0]!),
		id: "Draft",
		name: "Next",
		lifecycle: "draft",
		parent: "Now",
	};
	draft.content.nodes[1]!.responsibility = "Routes requests";
	board.variants.push(draft);
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...saved.plan,
		mappings: [
			{
				legacy: "Shop/System#Api",
				canonical: "Shop/Future#Api",
				reason: "One explicitly chosen identity",
			},
		],
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Now",
				baseline: { state: "Shop/System#Now", kind: "content" },
				reason: "Retain original parent",
			},
		],
	});
	const result = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		state: "Shop/System#Draft",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.modules.map((module) => module.id)).toContain("Shop/System#Api");
	expect(
		result.migrationPreview?.history?.find((entry) => entry.legacy === "Shop/System#Draft")
			?.conversion?.changes,
	).toEqual([
		{
			type: "assign",
			subject: "Shop/Future#Api",
			field: "responsibility",
			value: "Routes requests",
		},
	]);
});
