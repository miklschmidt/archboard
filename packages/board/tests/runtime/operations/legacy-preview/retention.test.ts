import { afterEach, expect, test } from "bun:test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import {
	previewFixture,
	savePreviewPlan,
} from "#tests/runtime/operations/legacy-preview/fixture.ts";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
} from "#tests/runtime/support/publication-fixture.ts";
const homes: string[] = [];
afterEach(() => {
	cleanPublicationFixtures();
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("signed migration checkpoints reopen exact scoped originals after live source and plan removal", async () => {
	const { root, vault, key, home } = publicationFixture();
	const legacy = previewFixture();
	homes.push(legacy.home);
	rmSync(vault, { recursive: true, force: true });
	cpSync(legacy.vault, vault, { recursive: true });
	const inventory = await savePreviewPlan(vault);
	const head = git(root, "rev-parse", "HEAD"),
		index = readFileSync(join(root, ".git/index"));
	const request = {
		target: "migration" as const,
		origin: "Shop",
		expectedPlan: inventory.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "signed-originals",
		writer: "fixture",
		doing: "Retain exact legacy originals",
		dependencies: [],
	};
	git(root, "config", "user.signingkey", join(home, "missing-key"));
	expect(await retainArchitectureCheckpoint(vault, request)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
	});
	expect(readLegacyInventory(vault, "Shop")).toMatchObject({
		source: inventory.source,
		planRevision: inventory.planRevision,
	});
	git(root, "config", "user.signingkey", key);
	const saved = await retainArchitectureCheckpoint(vault, request);
	if (!saved.success) throw new Error(JSON.stringify(saved));
	expect(git(root, "verify-commit", saved.checkpoint.id)).toBe("");
	for (const source of inventory.boards) rmSync(join(vault, source.file));
	rmSync(join(vault, ".archboard/migration-plan.json"));
	git(root, "reflog", "expire", "--expire=now", "--all");
	git(root, "gc", "--prune=now");
	const reopened = await readArchitectureModel(vault, undefined, undefined, {
		preview: "Shop",
		checkpoint: saved.checkpoint.id,
		state: "Shop/Future#Draft",
	});
	if (!reopened.success) throw new Error(JSON.stringify(reopened));
	expect(reopened.modules.map((module) => module.id)).toEqual([
		"Shop/Future#Shop",
		"Shop/Future#Api",
		"Shop/Future#Db",
	]);
	expect(reopened.selectedState).toMatchObject({ id: "Draft", lifecycle: "draft" });
	expect(reopened.migrationPreview?.originals).toEqual(inventory.boards);
	expect(reopened.migrationPreview?.selected).toMatchObject({
		legacy: "Shop/Future#Draft",
		completeModel: false,
	});
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await retainArchitectureCheckpoint(vault, request)).toEqual(saved);
	expect(
		await retainArchitectureCheckpoint(vault, { ...request, doing: "Different retention request" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
});

test("migration retention refuses changed source, changed plans, and unavailable dependencies", async () => {
	const { home, vault } = previewFixture();
	homes.push(home);
	git(home, "config", "user.name", "Fixture");
	git(home, "config", "user.email", "fixture@example.com");
	git(home, "config", "commit.gpgsign", "false");
	const inventory = await savePreviewPlan(vault);
	const request = {
		target: "migration" as const,
		origin: "Shop",
		expectedPlan: inventory.planRevision,
		expectedRevision: inventory.source.digest,
		operationId: "guarded-originals",
		writer: "fixture",
		doing: "Retain the reviewed originals",
		dependencies: [],
	};
	expect(
		await retainArchitectureCheckpoint(vault, { ...request, expectedPlan: "a".repeat(64) }),
	).toMatchObject({ success: false, code: "STALE_REVISION" });
	expect(
		await retainArchitectureCheckpoint(vault, { ...request, dependencies: ["a".repeat(40)] }),
	).toMatchObject({ success: false });
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		readFileSync(join(vault, "Shop.semantic.json"), "utf8") + "\n",
	);
	expect(await retainArchitectureCheckpoint(vault, request)).toMatchObject({
		success: false,
		code: "STALE_REVISION",
	});
	expect(
		Bun.spawnSync(["git", "-C", home, "rev-parse", "--verify", "refs/heads/archboard-history"])
			.exitCode,
	).not.toBe(0);
});
