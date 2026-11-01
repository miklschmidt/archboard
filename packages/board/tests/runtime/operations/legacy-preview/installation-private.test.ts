import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	initializeArchitectureArchive,
	migrateArchitectureModel,
	exportArchitectureModel,
	importArchitectureModel,
} from "@archboard/board/store-write";
import { installationFixture } from "#tests/runtime/operations/legacy-preview/install-fixture.ts";
import { git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { signing } from "#tests/runtime/support/publication-fixture.ts";
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
test("explicit private history shares cutover and portable original dependencies with Git-backed vaults", async () => {
	const source = await installationFixture();
	homes.push(source.home);
	const original = readFileSync(join(source.vault, "Shop.semantic.json"));
	rmSync(join(source.home, ".git"), { recursive: true, force: true });
	const initialized = await initializeArchitectureArchive(source.vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	signing(initialized.archive, source.key);
	const preview = await readArchitectureModel(source.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const installed = await migrateArchitectureModel(source.vault, {
		...source.request,
		...preview.migrationPreview!.installation!,
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	expect(installed.checkpoint.sources).toEqual([]);
	expect(existsSync(join(source.home, ".git"))).toBe(false);
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	expect(exported.bundle.inputs.map((i) => i.path)).toContain("migration.json");
	const target = await installationFixture();
	homes.push(target.home);
	rmSync(target.vault, { recursive: true, force: true });
	mkdirSync(target.vault, { recursive: true });
	const imported = await importArchitectureModel(target.vault, {
		bundle: exported.bundle,
		expectedRevision: {
			digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
			files: [],
		},
		operationId: "import-migration",
		writer: "owner",
		doing: "Restore migrated architecture",
	});
	if (!imported.success) throw new Error(JSON.stringify(imported));
	const bookmark = await readArchitectureModel(target.vault, undefined, undefined, {
		bookmark: "Shop/System#Unused",
	});
	expect(bookmark).toMatchObject({
		success: true,
		migration: { bookmark: { id: "Shop/System#Unused" } },
	});
	const originals = await readArchitectureModel(target.vault, undefined, undefined, {
		legacyAddress: "Store@Implemented",
	});
	if (!originals.success) throw new Error(JSON.stringify(originals));
	expect(
		originals.migrationPreview?.originalInputs?.find((i) => i.file === "Shop.semantic.json")
			?.base64,
	).toBe(original.toString("base64"));
	const current = readArchitectureModel(target.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(
		git(
			target.home,
			"merge-base",
			"--is-ancestor",
			current.migration!.checkpoint,
			imported.checkpoint.id,
		),
	).toBe("");
}, 15000);
