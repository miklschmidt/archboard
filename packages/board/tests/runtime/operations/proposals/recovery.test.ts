import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import {
	fixture,
	structureIntent,
	disposeFixtures,
	git,
} from "#tests/runtime/operations/model-edit/fixture.ts";
const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});

test("interrupted proposal creation resumes one signed checkpoint and never installs draft additions as current", async () => {
	const { root, vault } = fixture();
	const input = await structureIntent(vault, ["Shop"]);
	const request = {
		...input,
		proposal: { type: "create" as const, name: "Future cache" },
		changes: [
			{ type: "add-module" as const, module: { name: "Cache", kind: "service", order: 40 } },
		],
	};
	const file = join(root, "request.json");
	writeFileSync(file, JSON.stringify(request));
	const gateway = readFileSync(join(vault, "gateway.module.json"));
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			vault,
			file,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: "prepared" }, stdout: "pipe", stderr: "pipe" },
	);
	const stdout = new Response(child.stdout).text(),
		stderr = new Response(child.stderr).text();
	expect(await child.exited, `${await stdout} ${await stderr}`).toBe(86);
	Date.now = () => now() + BOARD_LOCK_MS.lease;
	const blocked = readArchitectureModel(vault);
	expect(blocked).toMatchObject({ success: false, code: "RECOVERY_REQUIRED" });
	if (blocked.success || blocked.recovery === undefined) throw new Error(JSON.stringify(blocked));
	const retained = await readArchitectureCheckpoint(vault, blocked.recovery.checkpoint);
	expect(retained).toMatchObject({
		success: true,
		selectedState: { lifecycle: "draft" },
		modules: expect.arrayContaining([expect.objectContaining({ name: "Cache" })]),
	});
	const recovered = await recoverArchitectureModel(vault);
	expect(recovered).toMatchObject({
		success: true,
		operation: { applied: true, checkpoint: { id: blocked.recovery.checkpoint } },
	});
	if (!recovered.success || recovered.operation === undefined)
		throw new Error(JSON.stringify(recovered));
	expect(await editArchitectureModule(vault, request)).toEqual(recovered.operation);
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	expect(current.modules.some((module) => module.name === "Cache")).toBe(false);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(gateway);
}, 15_000);

test("required signing failure and stale complete tokens install no proposal", async () => {
	const { root, vault } = fixture();
	const input = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const request = {
		...input,
		proposal: { type: "create" as const, name: "Queued" },
		changes: [
			{
				type: "edit-module" as const,
				subject: "Shop#Gateway",
				set: { description: "Queues work." },
			},
		],
	};
	git(root, "config", "commit.gpgsign", "true");
	git(root, "config", "gpg.format", "ssh");
	git(root, "config", "user.signingkey", join(root, "missing-key"));
	expect(await editArchitectureModule(vault, request)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
	});
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		proposals: [],
		revision: input.expectedRevision,
	});
	const gateway = join(vault, "gateway.module.json");
	writeFileSync(gateway, `${readFileSync(gateway, "utf8")}\n`);
	expect(await editArchitectureModule(vault, request)).toMatchObject({
		success: false,
		code: "STALE_REVISION",
		applied: false,
	});
	expect(readArchitectureModel(vault)).toMatchObject({ success: true, proposals: [] });
	const manifest = JSON.parse(readFileSync(join(vault, "model.json"), "utf8"));
	manifest.current.id = "Other";
	writeFileSync(join(vault, "model.json"), JSON.stringify(manifest));
	expect(await editArchitectureModule(vault, request)).toMatchObject({
		success: false,
		code: "TARGET_CHANGED",
		applied: false,
	});
}, 15_000);
