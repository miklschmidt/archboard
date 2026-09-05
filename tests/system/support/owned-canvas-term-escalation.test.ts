import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { stateDir } from "../../../src/runtime/engine/state-dir.ts";
import { processExists, startOwnedCanvas } from "./owned-canvas.ts";

const thisFile = import.meta.path;

if (process.env["ARCHBOARD_LIFECYCLE_SERVER"] === "term-escalation") {
	const lock = path.join(
		stateDir(),
		"codex-workbench",
		"codex-home",
		".archboard-codex-process.lock",
	);
	fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
	fs.writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
	const descendant = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
		detached: true,
		stdin: "ignore",
		stdout: "ignore",
		stderr: "ignore",
	});
	process.on("SIGTERM", () => {
		// This fixture intentionally resists ordinary termination.
	});
	Bun.serve({
		hostname: "127.0.0.1",
		port: Number(process.env["PORT"]),
		fetch(...args: readonly [{ readonly url: string }]) {
			const [request] = args;
			if (new URL(request.url).pathname === "/health") {
				return Response.json({ pid: process.pid });
			}
			return Response.json({ descendant: descendant.pid, lock });
		},
	});
	await new Promise<never>(() => {
		// The process remains alive until the owner escalates termination.
	});
}

test("ordinary TERM escalation completes forced canvas cleanup", async () => {
	const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-lifecycle-child-"));
	const canvas = await startOwnedCanvas({
		serverPath: thisFile,
		vault,
		env: { ARCHBOARD_LIFECYCLE_SERVER: "term-escalation" },
	});
	const stateResponse = await fetch(`${canvas.base}/cleanup-state`);
	const state = z
		.object({ descendant: z.number().int().positive(), lock: z.string() })
		.parse(await stateResponse.json());
	let disposalFailure: unknown;
	try {
		await canvas.dispose();
	} catch (error) {
		disposalFailure = error;
	} finally {
		if (processExists(state.descendant)) {
			try {
				process.kill(-state.descendant, "SIGKILL");
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
				if (code !== "ESRCH") {
					disposalFailure ??= error;
				}
			}
		}
	}
	if (disposalFailure instanceof Error) {
		throw disposalFailure;
	}
	if (disposalFailure !== undefined) {
		throw new Error("Canvas cleanup failed with a non-error value.", { cause: disposalFailure });
	}
	expect(processExists(state.descendant)).toBeFalse();
	expect(fs.existsSync(state.lock)).toBeFalse();
	expect(fs.existsSync(canvas.paths.root)).toBeFalse();
});
