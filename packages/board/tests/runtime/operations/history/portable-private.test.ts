import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	initializeArchitectureArchive,
	retainArchitectureCheckpoint,
	exportArchitectureModel,
	importArchitectureModel,
} from "@archboard/board/store-write";
import {
	untrackedFixture,
	cleanPrivateArchiveFixtures,
} from "#tests/runtime/support/private-archive-fixture.ts";
import {
	publicationFixture,
	signing,
	cleanPublicationFixtures,
} from "#tests/runtime/support/publication-fixture.ts";
import { git } from "#tests/runtime/operations/model-edit/fixture.ts";
import {
	destination,
	empty,
	cleanPortableFixtures,
} from "#tests/runtime/operations/history/portable-fixture.ts";
afterEach(() => {
	cleanPrivateArchiveFixtures();
	cleanPublicationFixtures();
	cleanPortableFixtures();
});
test("private bundles restore exact lost history without source repositories or source evidence", async () => {
	const source = untrackedFixture();
	const initialized = await initializeArchitectureArchive(source.vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	git(initialized.archive, "config", "user.name", "Private Author");
	git(initialized.archive, "config", "user.email", "private@example.test");
	git(initialized.archive, "config", "commit.gpgsign", "false");
	const current = readArchitectureModel(source.vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = await retainArchitectureCheckpoint(source.vault, {
		target: "current",
		expectedRevision: current.revision.digest,
		operationId: "private-target",
		writer: "agent",
		doing: "retaining private history",
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = untrackedFixture();
	rmSync(target.vault, { recursive: true });
	const { mkdirSync } = await import("node:fs");
	mkdirSync(target.vault, { recursive: true });
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "private-import",
		writer: "agent",
		doing: "restoring private architecture",
	};
	expect(await importArchitectureModel(target.vault, request)).toMatchObject({
		success: false,
		code: "ARCHIVE_NOT_INITIALIZED",
	});
	const fresh = await initializeArchitectureArchive(target.vault);
	if (!fresh.success) throw new Error(JSON.stringify(fresh));
	git(fresh.archive, "config", "user.name", "Private Reader");
	git(fresh.archive, "config", "user.email", "reader@example.test");
	git(fresh.archive, "config", "commit.gpgsign", "false");
	const installed = await importArchitectureModel(target.vault, request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	expect(await readArchitectureCheckpoint(target.vault, retained.checkpoint.id)).toMatchObject({
		success: true,
		checkpoint: { sources: [], publication: "saved-locally" },
	});
	const refs = git(fresh.archive, "for-each-ref", "--format=%(refname)")
		.split("\n")
		.filter(Boolean);
	for (const ref of refs) git(fresh.archive, "update-ref", "-d", ref);
	git(fresh.archive, "reflog", "expire", "--expire=now", "--all");
	git(fresh.archive, "gc", "--prune=now");
	expect(await readArchitectureCheckpoint(target.vault, retained.checkpoint.id)).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
	});
	const restored = await importArchitectureModel(target.vault, {
		...request,
		expectedRevision: exported.bundle.revision,
		operationId: "repair-history",
	});
	if (!restored.success) throw new Error(JSON.stringify(restored));
	expect(await readArchitectureCheckpoint(target.vault, retained.checkpoint.id)).toMatchObject({
		success: true,
		revision: current.revision,
	});
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: true,
		revision: current.revision,
	});
	expect(existsSync(join(target.root, ".git"))).toBe(false);
	expect(existsSync(join(source.root, ".git"))).toBe(false);
}, 15000);

test("import honors signing refusal and success while preserving the destination HEAD and dirty index", async () => {
	const source = publicationFixture();
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	writeFileSync(join(target.root, "source.ts"), "export const source = true;\n");
	git(target.root, "add", ".");
	git(target.root, "commit", "--quiet", "-m", "test: seed destination source");
	writeFileSync(join(target.root, "staged.txt"), "preserve staged content");
	git(target.root, "add", "staged.txt");
	const head = git(target.root, "rev-parse", "HEAD");
	const index = readFileSync(join(target.root, ".git/index"));
	signing(target.root, source.key);
	git(target.root, "config", "user.signingkey", join(target.root, "missing-key"));
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "signed-import",
		writer: "agent",
		doing: "restoring signed architecture",
	};
	expect(await importArchitectureModel(target.vault, request)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
	});
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: false,
		code: "MODEL_NOT_FOUND",
	});
	git(target.root, "config", "user.signingkey", source.key);
	const imported = await importArchitectureModel(target.vault, request);
	if (!imported.success) throw new Error(JSON.stringify(imported));
	expect(git(target.root, "verify-commit", imported.checkpoint.id)).toBe("");
	expect(git(target.root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(target.root, ".git/index"))).toEqual(index);
	expect(
		await importArchitectureModel(target.vault, { ...request, doing: "another intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
}, 15000);
