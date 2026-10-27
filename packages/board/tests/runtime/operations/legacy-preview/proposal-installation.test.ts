import { beforeAll, afterEach, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { migrateArchitectureModel } from "@archboard/board/store-write";
import {
	previewFixture,
	savePreviewPlan,
} from "#tests/runtime/operations/legacy-preview/fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
let prepared: Awaited<ReturnType<typeof prepareDraftFixture>> | undefined;
async function prepareDraftFixture() {
	const { home, vault, board } = previewFixture();
	homes.push(home);
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
	const result = await migrateArchitectureModel(vault, {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner",
		operationId: "convert-drafts",
		writer: "owner",
		doing: "Install complete migration",
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.proposals).toHaveLength(2);
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
	expect(proposal.changes).toEqual([
		{
			type: "assign",
			subject: "Shop/System#Api",
			field: "responsibility",
			value: "Routes purchases",
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
});
