import { afterEach, expect, test } from "bun:test";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import { LOCK_LEASE_MS } from "@archboard/timing";
import {
	fixture,
	git,
	intent,
	readBytes,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";
const actualNow = Date.now;
afterEach(() => {
	Date.now = actualNow;
	disposeFixtures();
});
const TEST_RECOVERY_TIMEOUT_MS = 15_000;
async function interrupted(point: string) {
	const value = fixture();
	const input = await intent(value.vault, `interrupt-${point}`);
	const request = join(value.root, "request.json");
	writeFileSync(request, JSON.stringify(input));
	if (["archive", "retained"].includes(point)) {
		const hook = join(value.root, ".git/hooks/reference-transaction");
		writeFileSync(
			hook,
			`#!/bin/sh\nif [ "$1" = committed ] && cat | grep -q '${point === "archive" ? "refs/heads/archboard-history" : "refs/archboard/transactions/"}'; then kill -KILL "$(cat '${value.root}/pid')"; fi\n`,
		);
		chmodSync(hook, 0o755);
	}
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			value.vault,
			request,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: point }, stdout: "pipe", stderr: "pipe" },
	);
	writeFileSync(join(value.root, "pid"), String(child.pid));
	const status = await child.exited;
	const output = await new Response(child.stdout).text();
	const errors = await new Response(child.stderr).text();
	if (point === "cleanup")
		expect(JSON.parse(output), errors).toMatchObject({
			success: true,
			applied: true,
			cleanup: "pending",
		});
	else
		expect(status, `${point}: ${output} ${errors}`).toBe(
			["archive", "retained"].includes(point) ? 137 : 86,
		);
	// Only the parent clock advances after the real process exits. Files, Git objects and refs remain real.
	// This expires the dead owner's lease without paying its production wait at every interruption point.
	if (point !== "cleanup") Date.now = () => actualNow() + LOCK_LEASE_MS;
	return { ...value, input };
}

test.each([
	"prepared",
	"retained",
	"installing",
	"file",
	"installed",
	"archive",
	"completed",
	"cleanup",
])(
	"interruption after %s recovers one durable result without mixed reads or duplicate checkpoints",
	async (point) => {
		const { root, vault, input } = await interrupted(point);
		expect(git(root, "ls-files", "--others", "--exclude-standard", "--", ".archboard/vault")).toBe(
			"",
		);
		expect(readArchitectureModel(vault), point).toMatchObject(
			["completed", "cleanup"].includes(point)
				? { success: true }
				: { success: false, code: "RECOVERY_REQUIRED" },
		);
		if (point === "archive")
			git(
				root,
				"worktree",
				"add",
				"--quiet",
				join(root, "archive-inspection"),
				"archboard-history",
			);
		const recovered = await recoverArchitectureModel(vault);
		expect(recovered, point).toMatchObject({
			success: true,
			operation: { applied: true, cleanup: "complete" },
		});
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(await editArchitectureModule(vault, input), point).toEqual(recovered.operation);
		expect(readArchitectureModel(vault), point).toMatchObject({
			success: true,
			revision: recovered.operation.after,
		});
		expect(await listArchitectureCheckpoints(vault), point).toMatchObject({
			success: true,
			checkpoints: [{ id: recovered.operation.checkpoint.id }],
		});
	},
	TEST_RECOVERY_TIMEOUT_MS,
);

test(
	"recovery preserves foreign bytes and refuses a changed branch before replay",
	async () => {
		const { root, vault, input } = await interrupted("file");
		const applied = readBytes(vault);
		writeFileSync(join(vault, "gateway.module.json"), "foreign incomplete bytes\n");
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_CONFLICT",
		});
		expect(readBytes(vault).toString()).toBe("foreign incomplete bytes\n");
		writeFileSync(join(vault, "gateway.module.json"), applied);
		git(root, "switch", "--quiet", "-c", "other");
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_CONTEXT_CHANGED",
		});
		expect(readBytes(vault)).toEqual(applied);
		git(root, "switch", "--quiet", "main");
		expect(
			await editArchitectureModule(vault, { ...input, description: "Different intent" }),
		).toMatchObject({ success: false, code: "OPERATION_REUSED" });
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: true,
			operation: { applied: true },
		});
	},
	TEST_RECOVERY_TIMEOUT_MS,
);

test(
	"linked worktrees share retained history while their current inputs and pending journals stay separate",
	async () => {
		const { root, vault, input } = await interrupted("prepared");
		const other = join(root, "linked");
		git(root, "worktree", "add", "--quiet", "-b", "linked", other);
		const otherVault = join(other, ".archboard/vault");
		const initial = readArchitectureModel(otherVault);
		expect(initial.success).toBe(true);
		expect(await recoverArchitectureModel(otherVault)).toEqual({ success: true });
		const second = await editArchitectureModule(otherVault, {
			...(await intent(otherVault, input.operationId)),
			description: "The other checkout",
		});
		if (!second.success) throw new Error(JSON.stringify(second));
		expect(readArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_REQUIRED",
		});
		const first = await recoverArchitectureModel(vault);
		expect(first).toMatchObject({ success: true, operation: { applied: true } });
		expect(readArchitectureModel(otherVault)).toMatchObject({
			success: true,
			revision: second.after,
		});
		const listed = await listArchitectureCheckpoints(vault);
		if (!listed.success) throw new Error(JSON.stringify(listed));
		expect(listed.checkpoints).toHaveLength(2);
		expect(
			await editArchitectureModule(otherVault, {
				...(await intent(otherVault, "another-read")),
				operationId: input.operationId,
				description: "changed intent",
			}),
		).toMatchObject({ success: false, code: "OPERATION_REUSED" });
	},
	TEST_RECOVERY_TIMEOUT_MS,
);

test(
	"added and removed foreign inputs block replay without losing their bytes",
	async () => {
		const { vault } = await interrupted("prepared");
		const original = readBytes(vault, "worker.module.json");
		rmSync(join(vault, "worker.module.json"));
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_CONFLICT",
		});
		writeFileSync(join(vault, "worker.module.json"), original);
		writeFileSync(join(vault, "foreign.module.json"), "unrecognized foreign bytes\n");
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_CONFLICT",
		});
		expect(readBytes(vault, "foreign.module.json").toString()).toBe("unrecognized foreign bytes\n");
		rmSync(join(vault, "foreign.module.json"));
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: true,
			operation: { applied: true },
		});
	},
	TEST_RECOVERY_TIMEOUT_MS,
);

test(
	"a synchronization signing failure precedes any recovery file installation",
	async () => {
		const { root, vault } = await interrupted("prepared");
		const before = readBytes(vault);
		const other = join(root, "other-archive-writer");
		git(root, "worktree", "add", "--quiet", "-b", "other-archive", other);
		const otherVault = join(other, ".archboard/vault");
		const appended = await editArchitectureModule(otherVault, {
			...(await intent(otherVault, "competing-checkpoint")),
			description: "The other coherent architecture",
		});
		if (!appended.success) throw new Error(JSON.stringify(appended));
		git(root, "config", "gpg.format", "ssh");
		git(root, "config", "commit.gpgsign", "true");
		git(root, "config", "user.signingkey", join(root, "missing-key"));
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_REQUIRED",
		});
		expect(readBytes(vault)).toEqual(before);
		const key = join(root, ".git/recovery-key");
		expect(Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]).exitCode).toBe(
			0,
		);
		git(root, "config", "user.signingkey", key);
		expect(await recoverArchitectureModel(vault)).toMatchObject({
			success: true,
			operation: { applied: true },
		});
		expect(git(root, "config", "--get", "commit.gpgsign")).toBe("true");
	},
	TEST_RECOVERY_TIMEOUT_MS,
);
