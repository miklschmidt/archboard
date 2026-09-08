import { expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";

import {
	CODEX_COMPOSED_SHUTDOWN_MS,
	PROCESS_GROUP_OBSERVATION_POLL_MS,
} from "../../../shared/timing/timing.js";
import {
	CodexProcessGroupError,
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "../process-group.js";
import { readProcessObservation } from "../../../shared/process-observation/index.js";

async function waitForQuiescent(
	identity: CodexProcessGroupIdentity,
	deadlineMs = CODEX_COMPOSED_SHUTDOWN_MS,
): Promise<void> {
	const deadline = Date.now() + deadlineMs;
	const operations = createCodexProcessGroupOperations();
	while (Date.now() < deadline) {
		if (operations.inspect(identity) === "quiescent") return;
		await Bun.sleep(PROCESS_GROUP_OBSERVATION_POLL_MS);
	}
	throw new Error(
		`Process group ${identity.pgid} did not become quiescent before cleanup deadline.`,
	);
}

async function waitForChildClose(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const onClose = (): void => {
			clearTimeout(timeout);
			resolve();
		};
		const timeout = setTimeout(() => {
			child.removeListener("close", onClose);
			reject(
				new Error(`Detached child ${String(child.pid)} did not close before cleanup deadline.`),
			);
		}, CODEX_COMPOSED_SHUTDOWN_MS);
		child.once("close", onClose);
	});
}

test(
	"proves detached process-group ownership and rejects a forged birth token",
	async () => {
		const operations = createCodexProcessGroupOperations();
		let child: ChildProcess | undefined;
		let identity: CodexProcessGroupIdentity | undefined;
		try {
			child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], {
				detached: true,
				stdio: "ignore",
			});
			if (child.pid === undefined) throw new Error("Detached Bun child did not expose a pid.");

			identity = operations.capture(child.pid);
			expect(identity).toMatchObject({ leaderPid: child.pid, pgid: child.pid });
			expect(operations.inspect(identity)).toBe("owned");

			const forged = {
				...identity,
				leaderStartTime: `${identity.leaderStartTime}:forged`,
			};
			expect(operations.inspect(forged)).toBe("reused");
			expect(() => operations.signal(forged, "SIGKILL")).toThrow(CodexProcessGroupError);
			try {
				operations.signal(forged, "SIGKILL");
			} catch (error) {
				expect(error).toMatchObject({ code: "reused" });
			}

			const stillLive = readProcessObservation(identity.leaderPid);
			expect(stillLive?.startTime).toBe(identity.leaderStartTime);
			expect(stillLive?.pgid).toBe(identity.pgid);
			expect(operations.inspect(identity)).toBe("owned");

			operations.signal(identity, "SIGTERM");
			await Promise.all([waitForChildClose(child), waitForQuiescent(identity)]);
			expect(operations.inspect(identity)).toBe("quiescent");
		} finally {
			if (identity !== undefined) {
				try {
					if (operations.inspect(identity) === "owned") operations.signal(identity, "SIGKILL");
				} catch {
					// A reused leader is intentionally never signalled by cleanup.
				}
				if (operations.inspect(identity) === "owned") {
					await waitForQuiescent(identity).catch(() => undefined);
				}
			} else if (child !== undefined) {
				try {
					child.kill("SIGKILL");
				} catch {
					/* The child may have closed while capture was reading its identity. */
				}
			}
			if (child !== undefined) {
				if (child.exitCode === null && child.signalCode === null) {
					try {
						child.kill("SIGKILL");
					} catch {
						/* The exact child may close after group inspection. */
					}
				}
				await waitForChildClose(child).catch(() => undefined);
				child.removeAllListeners();
				child.unref();
			}
		}
	},
	CODEX_COMPOSED_SHUTDOWN_MS + PROCESS_GROUP_OBSERVATION_POLL_MS * 4,
);
