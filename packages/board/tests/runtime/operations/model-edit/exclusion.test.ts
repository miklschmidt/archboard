import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import {
	fixture,
	git,
	intent,
	readBytes,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("another process cannot enter installation, completed retries stay available, and signing rechecks foreign inputs", async () => {
	const { root, vault } = fixture();
	const key = join(root, ".git/signing");
	expect(Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]).exitCode).toBe(
		0,
	);
	git(root, "config", "gpg.format", "ssh");
	git(root, "config", "user.signingkey", key);
	git(root, "config", "commit.gpgsign", "true");
	const signers = join(root, ".git/signers");
	writeFileSync(signers, `edit@example.test ${readFileSync(`${key}.pub`, "utf8")}`);
	git(root, "config", "gpg.ssh.allowedSignersFile", signers);
	const first = await intent(vault, "accepted-first");
	const completed = await editArchitectureModule(vault, first);
	if (!completed.success) throw new Error(JSON.stringify(completed));
	git(root, "verify-commit", completed.checkpoint.id);
	const next = { ...(await intent(vault, "held-next")), description: "Another description" };
	const gate = join(root, ".git/gate");
	expect(Bun.spawnSync(["mkfifo", gate]).exitCode).toBe(0);
	const ready = join(root, ".git/ready");
	const signer = join(root, ".git/gated-signer");
	writeFileSync(
		signer,
		'#!/bin/sh\n: > "$ARCHBOARD_SIGN_READY"\nread release < "$ARCHBOARD_SIGN_GATE"\nexec ssh-keygen "$@"\n',
	);
	chmodSync(signer, 0o755);
	git(root, "config", "gpg.ssh.program", signer);
	const request = join(root, ".git/request.json");
	writeFileSync(request, JSON.stringify(next));
	const arrived = new Promise<void>((resolve) => {
		const watcher = watch(join(root, ".git"), () => {
			if (existsSync(ready)) {
				watcher.close();
				resolve();
			}
		});
	});
	const child = Bun.spawn(
		[
			process.execPath,
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			vault,
			request,
		],
		{
			env: { ...process.env, ARCHBOARD_SIGN_READY: ready, ARCHBOARD_SIGN_GATE: gate },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	await arrived;
	try {
		expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "MODEL_BUSY" });
		expect(
			await editArchitectureModule(vault, { ...next, operationId: "racing-writer" }),
		).toMatchObject({ success: false, code: "MODEL_BUSY" });
		expect(await editArchitectureModule(vault, first)).toEqual(completed);
		const worker = JSON.parse(readBytes(vault, "worker.module.json").toString());
		writeFileSync(
			join(vault, "worker.module.json"),
			JSON.stringify({ ...worker, description: "External owner" }),
		);
	} finally {
		writeFileSync(gate, "release\n");
		await child.exited;
	}
	const output = await new Response(child.stdout).text();
	const errors = await new Response(child.stderr).text();
	expect(child.exitCode, errors).toBe(0);
	expect(JSON.parse(output)).toMatchObject({ success: false, code: "STALE_REVISION" });
	expect(JSON.parse(readBytes(vault).toString()).description).toBe(first.description);
	expect(JSON.parse(readBytes(vault, "worker.module.json").toString()).description).toBe(
		"External owner",
	);
});

test("a durable completed retry stays applied while another process finishes its cleanup", async () => {
	const { root, vault } = fixture();
	const input = await intent(vault, "cleanup-held");
	const gate = join(root, ".git/cleanup-gate");
	expect(Bun.spawnSync(["mkfifo", gate]).exitCode).toBe(0);
	const ready = join(root, ".git/cleanup-ready");
	const hook = join(root, ".git/hooks/reference-transaction");
	writeFileSync(
		hook,
		'#!/bin/sh\nif [ "$1" = prepared ] && grep -Eq " 0+ refs/archboard/transactions/"; then\n: > "$ARCHBOARD_CLEANUP_READY"\nread release < "$ARCHBOARD_CLEANUP_GATE"\nfi\nexit 0\n',
	);
	chmodSync(hook, 0o755);
	const request = join(root, ".git/cleanup-request.json");
	writeFileSync(request, JSON.stringify(input));
	const arrived = new Promise<void>((resolve) => {
		const watcher = watch(join(root, ".git"), () => {
			if (existsSync(ready)) {
				watcher.close();
				resolve();
			}
		});
	});
	const child = Bun.spawn(
		[
			process.execPath,
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			vault,
			request,
		],
		{
			env: { ...process.env, ARCHBOARD_CLEANUP_READY: ready, ARCHBOARD_CLEANUP_GATE: gate },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	await arrived;
	let retry;
	try {
		expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "MODEL_BUSY" });
		const retained = await listArchitectureCheckpoints(vault);
		if (!retained.success) throw new Error(JSON.stringify(retained));
		expect(retained.checkpoints).toHaveLength(1);
		retry = await editArchitectureModule(vault, input);
		expect(retry).toMatchObject({
			success: true,
			applied: true,
			cleanup: "pending",
			checkpoint: { id: retained.checkpoints[0]!.id },
		});
	} finally {
		writeFileSync(gate, "release\n");
		await child.exited;
	}
	const output = await new Response(child.stdout).text();
	const errors = await new Response(child.stderr).text();
	expect(child.exitCode, errors).toBe(0);
	const completed = JSON.parse(output);
	expect(completed).toEqual({ ...retry, cleanup: "complete" });
	expect(await editArchitectureModule(vault, input)).toEqual(completed);
}, 15_000);
