import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createVoiceAgent } from "#server/services/agent/voice-agent.ts";

/**
 * A fresh real directory that holds a directory `real`, a link `link` to it (as macOS links
 * `/tmp` to `/private/tmp`), and a Codex executable that proves its version and then exits.
 * @param check Receives the directory and the executable.
 */
async function withLinkedDirectory(
	check: (root: string, executablePath: string) => Promise<void>,
): Promise<void> {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "voice-agent-")));
	try {
		mkdirSync(join(root, "real"));
		symlinkSync(join(root, "real"), join(root, "link"), "dir");
		const executablePath = join(root, "codex");
		writeFileSync(
			executablePath,
			'#!/bin/sh\n[ "$1" = --version ] && echo "codex-cli 0.160.0" && exit 0\nexit 1\n',
		);
		chmodSync(executablePath, 0o755);
		await check(root, executablePath);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * Start an agent on one state directory and return what the start rejected with.
 * @param directory The state directory.
 * @param executablePath The Codex executable.
 * @param checkout The admitted checkout.
 * @returns The rejection and the status after it.
 */
async function failedStart(directory: string, executablePath: string, checkout: string) {
	const agent = createVoiceAgent({
		storage: { directory },
		codex: { executablePath },
		checkouts: [checkout],
		instructions: { coordinator: "Coordinate.", workhorse: "Work." },
		onFatal: () => undefined,
	});
	try {
		const rejection: unknown = await agent.start().then(
			() => null,
			(error: unknown) => error,
		);
		return { rejection, status: agent.status() };
	} finally {
		await agent.shutdown();
	}
}

test("a state directory that is a link is refused: start rejects with startup_failed and the refusal in cause", async () => {
	await withLinkedDirectory(async (root, executablePath) => {
		const { rejection, status } = await failedStart(join(root, "link"), executablePath, root);
		expect(rejection).toMatchObject({
			code: "startup_failed",
			cause: { code: "storage_refused" },
		});
		expect(status).toMatchObject({ state: "failed", ready: false });
		expect(status.failure).toEqual(expect.any(String));
	});
});
