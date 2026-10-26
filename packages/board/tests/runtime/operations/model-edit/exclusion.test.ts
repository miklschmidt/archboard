import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readArchitectureModel } from "@archboard/board/store-read";
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
