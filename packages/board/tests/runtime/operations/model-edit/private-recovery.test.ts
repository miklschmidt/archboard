import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
	readArchitecturePublication,
} from "@archboard/board/store-read";
import {
	initializeArchitectureArchive,
	editArchitectureModule,
	recoverArchitectureModel,
	configureArchitecturePublication,
	publishArchitectureHistory,
} from "@archboard/board/store-write";
import { BOARD_LOCK_MS } from "@archboard/timing";
import {
	untrackedFixture,
	cleanPrivateArchiveFixtures,
} from "#tests/runtime/support/private-archive-fixture.ts";
import { structureIntent } from "#tests/runtime/operations/model-edit/fixture.ts";
import { git } from "#tests/runtime/support/publication-fixture.ts";

const actualNow = Date.now;
afterEach(() => {
	Date.now = actualNow;
	cleanPrivateArchiveFixtures();
});

test("a private interrupted transfer preserves affected subjects and publication through recovery", async () => {
	const { root, vault } = untrackedFixture();
	const initialized = await initializeArchitectureArchive(vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	git(initialized.archive, "config", "user.name", "Private Author");
	git(initialized.archive, "config", "user.email", "private@example.test");
	git(initialized.archive, "config", "commit.gpgsign", "false");
	const input = {
		...(await structureIntent(vault, ["Shop#Gateway", "Shop#Worker", "Shop#Dispatch"])),
		changes: [
			{ type: "edit-module" as const, subject: "Shop#Gateway", set: { name: "API" } },
			{
				type: "edit-relationship" as const,
				subject: "Shop#Dispatch",
				source: "Shop#Worker",
				set: { to: "Shop#Gateway" },
			},
		],
	};
	const request = join(root, "request.json");
	writeFileSync(request, JSON.stringify(input));
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			vault,
			request,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: "file" }, stdout: "pipe", stderr: "pipe" },
	);
	expect(await child.exited, await new Response(child.stderr).text()).toBe(86);
	Date.now = () => actualNow() + BOARD_LOCK_MS.lease;
	const interrupted = readArchitectureModel(vault);
	expect(interrupted).toMatchObject({
		success: false,
		code: "RECOVERY_REQUIRED",
		recovery: {
			operationId: input.operationId,
			subjects: ["Shop#Gateway", "Shop#Dispatch", "Shop#Worker"],
		},
	});
	if (interrupted.success || interrupted.recovery === undefined)
		throw new Error(JSON.stringify(interrupted));
	const checkpoint = interrupted.recovery.checkpoint;
	expect(await readArchitectureCheckpoint(vault, checkpoint)).toMatchObject({
		success: true,
		revision: interrupted.recovery.after,
	});
	const remote = join(root, "remote.git");
	git(initialized.archive, "init", "--quiet", "--bare", remote);
	git(initialized.archive, "remote", "add", "archive", `file://${remote}`);
	const destination = { remote: "archive", ref: "refs/heads/architecture-archive" };
	expect(await configureArchitecturePublication(vault, destination)).toMatchObject({
		success: true,
	});
	expect(await publishArchitectureHistory(vault, { ...destination, checkpoint })).toMatchObject({
		success: true,
		publication: "published",
	});
	// Publication of the retained candidate cannot expose a partial current installation.
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "RECOVERY_REQUIRED" });
	const file = join(vault, "gateway.module.json");
	const installed = readFileSync(file);
	writeFileSync(file, "foreign architecture bytes");
	const refused = await recoverArchitectureModel(vault);
	expect(refused).toMatchObject({ success: false, code: "RECOVERY_CONFLICT", applied: "unknown" });
	expect(readFileSync(file, "utf8")).toBe("foreign architecture bytes");
	expect(JSON.stringify(refused)).not.toContain(root);
	const peer = untrackedFixture();
	process.env["XDG_STATE_HOME"] = join(root, "..", "state");
	// Both vaults have identical model identities, but only the addressed vault owns this journal.
	expect(readArchitectureModel(peer.vault).success).toBe(true);
	expect(await recoverArchitectureModel(peer.vault)).toEqual({ success: true });
	// Restore the first machine-state location after creating the independent fixture.
	process.env["XDG_STATE_HOME"] = join(root, "..", "state");
	writeFileSync(file, installed);
	git(root, "init", "--quiet");
	expect(await recoverArchitectureModel(vault)).toMatchObject({
		success: false,
		code: "RECOVERY_REQUIRED",
	});
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "RECOVERY_REQUIRED" });
	rmSync(join(root, ".git"), { recursive: true });
	expect(await recoverArchitectureModel(vault)).toMatchObject({
		success: true,
		operation: {
			applied: true,
			subjects: interrupted.recovery.subjects,
			checkpoint: { id: checkpoint, publication: "saved-locally" },
		},
	});
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: true,
		checkpoint: { id: checkpoint },
	});
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		revision: interrupted.recovery.after,
		relationships: [{ id: "Shop#Dispatch", from: "Shop#Worker", to: "Shop#Gateway" }],
	});
	expect(await readArchitecturePublication(vault, checkpoint)).toMatchObject({
		success: true,
		publication: "published",
	});
	expect(await listArchitectureCheckpoints(vault)).toMatchObject({
		success: true,
		checkpoints: [{ id: checkpoint }],
	});
	git(initialized.archive, "reflog", "expire", "--expire=now", "--all");
	git(initialized.archive, "gc", "--prune=now");
	expect(await readArchitectureCheckpoint(vault, checkpoint)).toMatchObject({
		success: true,
		revision: interrupted.recovery.after,
	});
}, 30000);
