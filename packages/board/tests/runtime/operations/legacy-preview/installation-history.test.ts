import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import {
	migrateArchitectureModel,
	exportArchitectureModel,
	claimArchitectureSubjects,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
test("migration preserves standing, blocked descendants, corrections, and unavailable original historical beats", async () => {
	const value = narrativeFixture();
	homes.push(value.home);
	rmSync(join(value.vault, "Future.semantic.json"));
	const inventory = readLegacyInventory(value.vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const board = inventory.boards[0]!.document!,
		current = board.variants[0]!;
	const originalBase = structuredClone(current.content);
	current.content.nodes[1]!.responsibility = "Changed current";
	const draft = {
		...structuredClone(current),
		id: "Draft",
		name: "Next",
		lifecycle: "draft" as const,
		parent: current.id,
		reconciliation: {
			against: current.id,
			atVersion: 1,
			base: originalBase,
			issues: [
				{
					subject: "Api",
					what: "node" as const,
					kind: "competing-field" as const,
					field: "responsibility",
					mine: "Draft answer",
					theirs: "Changed current",
					repair: "Choose one description",
				},
			],
		},
	};
	draft.content.nodes[1]!.responsibility = "Draft answer";
	const child = {
		...structuredClone(draft),
		id: "Child",
		name: "Child",
		parent: "Draft",
		reconciliation: { ...draft.reconciliation, against: "Draft", issues: [], blockedBy: "Draft" },
	};
	const historical = {
		...structuredClone(current),
		id: "Old",
		name: "Original",
		lifecycle: "historical" as const,
		corrections: [
			{
				at: "2026-01-02T00:00:00.000Z",
				reason: "Retain the correction evidence",
				revisions: [{ repo: "github.com/acme/shop", commit: "a".repeat(40) }],
			},
		],
	};
	delete historical.content.walkthroughs[0]!.beats[0]!.view;
	board.variants = [historical, current, draft, child];
	board.adoptions = [
		{
			variant: current.id,
			from: "Old",
			at: "2026-01-03T00:00:00.000Z",
			reason: "Built the current architecture",
		},
	];
	writeFileSync(join(value.vault, "Shop.semantic.json"), JSON.stringify(board));
	const original = readFileSync(join(value.vault, "Shop.semantic.json"));
	const saved = await savePreviewPlan(value.vault);
	await savePreviewPlan(value.vault, {
		...saved.plan,
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Now",
				baseline: { kind: "reconciliation-base", state: "Shop/System#Draft" },
				reason: "Keep conflict base",
			},
			{
				legacy: "Shop/System#Child",
				predecessor: "Shop/System#Draft",
				baseline: { kind: "reconciliation-base", state: "Shop/System#Child" },
				reason: "Keep blocked child base",
			},
		],
	});
	const preview = await readArchitectureModel(value.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const result = await migrateArchitectureModel(value.vault, {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner",
		operationId: "standing-migration",
		writer: "owner",
		doing: "Install with retained standing",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.reconciliation).toBe(true);
	const currentModel = readArchitectureModel(value.vault);
	if (!currentModel.success) throw new Error(JSON.stringify(currentModel));
	const installedDraft = currentModel.proposals.find(
			(p) => p.migration?.legacy === "Shop/System#Draft",
		)!,
		installedChild = currentModel.proposals.find(
			(p) => p.migration?.legacy === "Shop/System#Child",
		)!;
	expect(installedDraft.standing?.issues[0]?.subject).toBe("Shop/System#Api");
	expect(installedChild.standing?.blockedBy).toBe(installedDraft.id);
	const selected = await readArchitectureModel(value.vault, undefined, undefined, {
		state: installedDraft.id,
		walkthrough: "Shop/System#Tour",
	});
	expect(selected).toMatchObject({
		success: true,
		playback: { beats: [{ status: "ready" }, { status: "ready" }, { status: "ready" }] },
	});
	const originalPlayback = await readArchitectureModel(value.vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: currentModel.migration!.checkpoint,
		state: "Shop/System#Old",
		walkthrough: "Shop/System#Tour",
	});
	if (!originalPlayback.success) throw new Error(JSON.stringify(originalPlayback));
	expect(originalPlayback.playback?.beats[0]).toMatchObject({
		status: "unavailable",
		diagnostics: [{ code: "WALKTHROUGH_VIEW_REQUIRED" }],
	});
	expect(
		originalPlayback.migrationPreview?.originalInputs?.find((i) => i.file === "Shop.semantic.json")
			?.base64,
	).toBe(original.toString("base64"));
	expect(await exportArchitectureModel(value.vault)).toMatchObject({ success: true });
}, 15000);

test("an imported historical predecessor keeps exact scoped ancestry instead of borrowing composed current modules", async () => {
	const value = narrativeFixture();
	homes.push(value.home);
	rmSync(join(value.vault, "Future.semantic.json"));
	const inventory = readLegacyInventory(value.vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const board = inventory.boards[0]!.document!,
		current = board.variants[0]!;
	const old = {
		...structuredClone(current),
		id: "Old",
		name: "Original",
		lifecycle: "historical" as const,
	};
	old.content = {
		nodes: [
			{ id: "Api", name: "Old API", kind: "module", responsibility: "Original entry", order: 10 },
		],
		edges: [],
		flows: [],
		walkthroughs: [],
	};
	const draft = {
		...structuredClone(old),
		id: "Draft",
		name: "Historical alternative",
		lifecycle: "draft" as const,
		parent: "Old",
	};
	draft.content.nodes[0]!.responsibility = "Alternative original entry";
	const originalDraft = {
		...draft,
		reconciliation: {
			against: "Old",
			atVersion: 1,
			base: structuredClone(old.content),
			issues: [
				{
					subject: "Api",
					what: "node",
					kind: "competing-field" as const,
					field: "responsibility",
					mine: "Alternative original entry",
					theirs: "Original entry",
					repair: "Choose one original answer",
				},
			],
		},
	};
	board.variants = [old, current, originalDraft];
	writeFileSync(join(value.vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(value.vault);
	await savePreviewPlan(value.vault, {
		...saved.plan,
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Old",
				baseline: { kind: "reconciliation-base", state: "Shop/System#Draft" },
				reason: "Keep the actual historical predecessor",
			},
		],
	});
	const preview = await readArchitectureModel(value.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const result = await migrateArchitectureModel(value.vault, {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner",
		operationId: "historical-parent",
		writer: "owner",
		doing: "Preserve exact original ancestry",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	const canonical = readArchitectureModel(value.vault);
	if (!canonical.success) throw new Error(JSON.stringify(canonical));
	const proposal = canonical.proposals[0]!;
	expect(proposal.predecessorCheckpoint).toBeDefined();
	const selected = await readArchitectureModel(value.vault, undefined, undefined, {
		state: proposal.id,
		compare: false,
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.modules.map((m) => m.id)).toEqual(["Shop/System#Api"]);
	expect(selected.modules[0]?.responsibility).toBe("Alternative original entry");
	expect(canonical.modules).toHaveLength(3);
	const target = { model: canonical.manifest.id, state: proposal.id };
	const claimed = await claimArchitectureSubjects(value.vault, {
		target,
		writer: "owner",
		reason: "Settle original proposal",
		subjects: ["Shop", proposal.id, "Shop/System#Api"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const settled = await editArchitectureModule(value.vault, {
		target,
		expectedRevision: canonical.revision,
		operationId: "settle-imported-original",
		writer: "owner",
		doing: "Settle the imported original proposal",
		claim: claimed.claim.id,
		changes: [],
		proposal: {
			type: "settle",
			resolutions: [{ subject: "Shop/System#Api", field: "responsibility", take: "theirs" }],
		},
	});
	expect(settled).toMatchObject({ success: true, reconciliation: false });
	expect(await exportArchitectureModel(value.vault)).toMatchObject({ success: true });
}, 15000);
