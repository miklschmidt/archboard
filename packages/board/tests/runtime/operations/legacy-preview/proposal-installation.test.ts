import { beforeAll, afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	migrateArchitectureModel,
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
let prepared: Awaited<ReturnType<typeof prepareDraftFixture>> | undefined;
async function prepareDraftFixture() {
	const { home, vault, original: board } = narrativeFixture();
	homes.push(home);
	// Legacy filenames put System first; canonical filenames put lowercase ahead first.
	const other = { ...structuredClone(board), id: "ahead", name: "Other shop" };
	for (const module of other.variants[0]!.content.nodes) {
		module.name = `Other ${module.name}`;
		delete module.binding;
	}
	writeFileSync(join(vault, "Zulu.semantic.json"), JSON.stringify(other));
	const draft = {
		...structuredClone(board.variants[0]!),
		id: "Draft",
		name: "Next",
		lifecycle: "draft",
		parent: "Now",
	};
	draft.content.nodes[1]!.responsibility = "Routes purchases";
	board.variants.push(draft);
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(board));
	const saved = await savePreviewPlan(vault);
	await savePreviewPlan(vault, {
		...saved.plan,
		drafts: [
			{
				legacy: "Shop/System#Draft",
				predecessor: "Shop/System#Now",
				baseline: { kind: "content", state: "Shop/System#Now" },
				reason: "Keep original parent",
			},
			{
				legacy: "Shop/Future#Draft",
				predecessor: null,
				baseline: { kind: "empty", state: null },
				reason: "Keep planning independent",
			},
		],
	});
	const preview = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!preview.success) throw new Error(JSON.stringify(preview));
	return { vault, preview };
}
beforeAll(async () => {
	prepared = await prepareDraftFixture();
});
test("cutover installs separate compact drafts and retained baselines without implementing planning-only subjects", async () => {
	if (prepared === undefined) throw new Error("Draft fixture unavailable");
	const { vault, preview } = prepared;
	const request = {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner" as const,
		operationId: "convert-drafts",
		writer: "owner",
		doing: "Install complete migration",
	};
	const result = await migrateArchitectureModel(vault, request);
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(await migrateArchitectureModel(vault, request)).toEqual(result);
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.proposals).toHaveLength(2);
	expect(current.collections.map((collection) => collection.id)).toEqual(["ahead", "System"]);
	expect(current.walkthroughs.map((walkthrough) => walkthrough.id)).toEqual([
		"Shop/ahead#Tour",
		"Shop/System#Tour",
	]);
	expect(current.modules.some((m) => m.id.startsWith("Shop/Future#"))).toBe(false);
	const proposal = current.proposals.find((p) => p.migration?.legacy === "Shop/System#Draft")!;
	const selected = await readArchitectureModel(vault, undefined, undefined, {
		state: proposal.id,
		compare: false,
	});
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.modules.find((m) => m.id === "Shop/System#Api")?.responsibility).toBe(
		"Routes purchases",
	);
	expect(selected.collections).toEqual(current.collections);
	expect(
		selected.walkthroughs.find((walkthrough) => walkthrough.id === "Shop/System#Tour")?.beats,
	).toEqual(
		current.walkthroughs.find((walkthrough) => walkthrough.id === "Shop/System#Tour")?.beats,
	);
	expect(proposal.changes).toEqual([
		{
			type: "assign",
			subject: "Shop/System#Api",
			field: "responsibility",
			value: "Routes purchases",
		},
		{
			type: "assign",
			subject: "Shop/System#Tour",
			field: "target",
			value: { state: proposal.id },
		},
	]);
	const future = current.proposals.find((p) => p.migration?.legacy === "Shop/Future#Draft")!;
	const planning = await readArchitectureModel(vault, undefined, undefined, {
		state: future.id,
		compare: false,
	});
	if (!planning.success) throw new Error(JSON.stringify(planning));
	expect(planning.manifest.current).toBeNull();
	expect(planning.modules.map((m) => m.id)).toEqual([
		"Shop/Future#Shop",
		"Shop/Future#Api",
		"Shop/Future#Db",
	]);
	const target = { model: current.manifest.id, state: proposal.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "owner",
		reason: "Continue the migrated draft",
		subjects: [current.manifest.id, proposal.id, "Shop/System#Api"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	try {
		const edited = await editArchitectureModule(vault, {
			target,
			expectedRevision: current.revision,
			operationId: "edit-migrated-draft",
			writer: "owner",
			doing: "Continue the migrated draft",
			claim: claimed.claim.id,
			proposal: { type: "edit" },
			changes: [
				{
					type: "edit-module",
					subject: "Shop/System#Api",
					set: { responsibility: "Routes confirmed purchases" },
				},
			],
		});
		if (!edited.success) throw new Error(JSON.stringify(edited));
		const reopened = await readArchitectureModel(vault, undefined, undefined, {
			state: proposal.id,
			compare: false,
		});
		if (!reopened.success) throw new Error(JSON.stringify(reopened));
		expect(reopened.modules.find((module) => module.id === "Shop/System#Api")?.responsibility).toBe(
			"Routes confirmed purchases",
		);
	} finally {
		expect(
			await releaseArchitectureClaim(vault, { claim: claimed.claim.id, writer: "owner" }),
		).toMatchObject({
			success: true,
		});
	}
});
