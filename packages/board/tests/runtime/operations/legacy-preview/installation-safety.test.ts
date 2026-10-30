import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import { migrateArchitectureModel } from "@archboard/board/store-write";
import { installationFixture } from "#tests/runtime/operations/legacy-preview/install-fixture.ts";
import { git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
test("complete source, plan, policy, target, preview, and checkout fingerprints refuse changed intent before installation", async () => {
	const value = await installationFixture();
	homes.push(value.home);
	for (const path of [
		"Shop.semantic.json",
		".archboard/config.yaml",
		".archboard/migration-plan.json",
	]) {
		const file = join(value.vault, path),
			original = readFileSync(file);
		writeFileSync(file, Buffer.concat([original, Buffer.from("\n")]));
		expect(await migrateArchitectureModel(value.vault, value.request)).toMatchObject({
			success: false,
			code: "STALE_REVISION",
			applied: false,
		});
		expect(readFileSync(file)).toEqual(Buffer.concat([original, Buffer.from("\n")]));
		writeFileSync(file, original);
	}
	const target = join(value.vault, "foreign.module.json");
	writeFileSync(target, "foreign target");
	expect(await migrateArchitectureModel(value.vault, value.request)).toMatchObject({
		success: false,
		code: "STALE_REVISION",
	});
	expect(readFileSync(target, "utf8")).toBe("foreign target");
	rmSync(target);
	expect(
		await migrateArchitectureModel(value.vault, {
			...value.request,
			previewRevision: { ...value.request.previewRevision, files: [] },
		}),
	).toMatchObject({ success: false, code: "STALE_REVISION" });
	const branch = git(value.home, "symbolic-ref", "HEAD");
	git(value.home, "symbolic-ref", "HEAD", "refs/heads/changed");
	expect(await migrateArchitectureModel(value.vault, value.request)).toMatchObject({
		success: false,
		code: "RECOVERY_CONTEXT_CHANGED",
	});
	git(value.home, "symbolic-ref", "HEAD", branch);
});
test("a failed configured signer leaves all live inputs, HEAD, and index unchanged", async () => {
	const value = await installationFixture();
	homes.push(value.home);
	const original = readFileSync(join(value.vault, "Shop.semantic.json")),
		plan = readFileSync(join(value.vault, ".archboard/migration-plan.json"));
	git(value.home, "add", ".");
	const index = git(value.home, "ls-files", "--stage");
	const head = git(value.home, "symbolic-ref", "HEAD");
	git(value.home, "config", "commit.gpgsign", "true");
	git(value.home, "config", "gpg.format", "ssh");
	git(value.home, "config", "user.signingkey", join(value.home, "missing-key"));
	expect(await migrateArchitectureModel(value.vault, value.request)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
	});
	expect(readFileSync(join(value.vault, "Shop.semantic.json"))).toEqual(original);
	expect(readFileSync(join(value.vault, ".archboard/migration-plan.json"))).toEqual(plan);
	expect(git(value.home, "ls-files", "--stage")).toBe(index);
	expect(git(value.home, "symbolic-ref", "HEAD")).toBe(head);
	expect(git(value.home, "config", "commit.gpgsign")).toBe("true");
});
test("a missing live beat view blocks cutover without rewriting original bytes", async () => {
	const value = await installationFixture();
	homes.push(value.home);
	const inventory = readLegacyInventory(value.vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const original = structuredClone(
		inventory.boards.find((b) => b.document?.id === "System")!.document!,
	);
	delete original.variants[0]!.content.walkthroughs[0]!.beats[0]!.view;
	writeFileSync(join(value.vault, "Shop.semantic.json"), JSON.stringify(original));
	rmSync(join(value.vault, ".archboard/migration-plan.json"));
	await savePreviewPlan(value.vault);
	const preview = await readArchitectureModel(value.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const bytes = readFileSync(join(value.vault, "Shop.semantic.json"));
	expect(
		await migrateArchitectureModel(value.vault, {
			...value.request,
			expectedSource: preview.migrationPreview!.source,
			expectedPlan: preview.migrationPreview!.planRevision!,
			previewRevision: preview.revision,
			...preview.migrationPreview!.installation!,
		}),
	).toMatchObject({ success: false, code: "MAPPING_UNRESOLVED" });
	expect(readFileSync(join(value.vault, "Shop.semantic.json"))).toEqual(bytes);
});
