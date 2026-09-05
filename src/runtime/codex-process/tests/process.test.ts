import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	CodexProcessError,
} from "../process.js";
import { createCodexProcessForTesting } from "../testing.js";
import {
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_TERM_GRACE_MS,
} from "../../../shared/timing/timing.js";
import {
	fixture,
	processOptions,
	removeRoot,
	startReady,
	temporaryRoot,
	waitForState,
} from "./support.js";

const createCodexProcess = createCodexProcessForTesting;

describe("Codex process owner", () => {
	test("spawns the exact app-server argv and closed child environment", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`console.log(JSON.stringify({ argv: process.argv.slice(2), keys: Object.keys(process.env), home: process.env.CODEX_HOME, sqlite: process.env.CODEX_SQLITE_HOME, pwd: process.env.PWD, secret: process.env.OPENAI_API_KEY })); process.stdin.resume(); process.on("SIGTERM", () => process.exit(0));`,
			);
			const processOwner = createCodexProcessForTesting(processOptions(root, executable));
			owner = processOwner;
			const output = new Promise<Record<string, unknown>>((resolve) => {
				const unsubscribe = processOwner.onChild((child) => {
					child.lifecycle.markAppServerReady();
					child.stdout.once("data", (chunk) => {
						unsubscribe();
						resolve(JSON.parse(chunk.toString()) as Record<string, unknown>);
					});
				});
			});
			const started = await processOwner.start();
			const observed = await output;
			expect(started.state).toBe("running");
			expect(started.ready).toBe(true);
			expect(started.argv).toEqual([executable, ...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed["argv"]).toEqual([...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed["keys"]).toEqual(["HOME", "PATH", "CODEX_HOME", "CODEX_SQLITE_HOME"]);
			expect(observed["home"]).toBe(path.join(root, "storage", "codex-home"));
			expect(observed["pwd"]).toBeUndefined();
			expect(observed["secret"]).toBeUndefined();
			expect(processOwner.snapshot().stderr.totalBytes).toBe(0);
			expect(processOwner.snapshot().stderr.redacted).toBe(true);
			const stopped = await processOwner.stop();
			expect(stopped.state).toBe("stopped");
			expect(stopped.lastExit?.classification).toBe("requested");
			expect(await processOwner.stop()).toBe(stopped);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("enters bounded backoff after an early crash and doubles only across failures", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `console.error("crash fixture"); process.exit(17);`);
			owner = createCodexProcessForTesting(processOptions(root, executable));
			const started = owner.start();
			const backoff = await waitForState(owner, (state) => state === "backoff");
			await started.catch(() => undefined);
			expect(backoff.failure?.code).toBe("early_exit");
			expect(backoff.restartAttempt).toBe(1);
			expect(backoff.restartDelayMs).toBe(CODEX_PROCESS_RESTART_BASE_MS);
			await owner.stop();
			expect(owner.snapshot().state).toBe("stopped");
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("resets backoff only after an account-ready child and clears readiness on exit", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stdin.resume(); setInterval(() => {}, ${CODEX_TERM_GRACE_MS});`,
			);
			owner = createCodexProcessForTesting(processOptions(root, executable));
			await startReady(owner);
			const currentChild = owner.currentChild();
			if (!currentChild) {
				throw new Error("Expected a running Codex child.");
			}
			currentChild.lifecycle.markAccountReady();
			expect(owner.snapshot().accountReady).toBe(true);
			const child = owner.currentChild();
			if (!child) {
				throw new Error("Expected a running Codex child.");
			}
			process.kill(child.pid, "SIGKILL");
			const backoff = await waitForState(owner, (state) => state === "backoff");
			expect(backoff.accountReady).toBe(false);
			expect(backoff.restartAttempt).toBe(1);
			expect(backoff.restartDelayMs).toBe(CODEX_PROCESS_RESTART_BASE_MS);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("makes strict-config rejection terminal and drains stderr within the cap", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stderr.write("strict-"); setImmediate(() => { process.stderr.write("config rejected: extra argument\\n"); process.exit(2); });`,
			);
			owner = createCodexProcessForTesting({
				...processOptions(root, executable),
				stderrLimitBytes: CODEX_PROCESS_STDERR_MAX_BYTES,
			});
			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			const started = owner.start();
			await started.catch(() => undefined);
			const snapshot = await terminal;
			expect(snapshot.failure?.code).toBe("strict_config_rejected");
			expect(snapshot.lastExit?.classification).toBe("strict_config");
			expect(snapshot.stderr.text).toContain("strict-config rejected");
			await owner.stop();
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("does not classify strict-looking runtime text after readiness as config rejection", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stdin.once("data", () => { process.stderr.write("strict-config runtime text"); process.exit(17); });`,
			);
			owner = createCodexProcess(processOptions(root, executable));
			owner.onChild((child) => {
				child.lifecycle.markAppServerReady();
				child.stdin.write("ready\n");
			});
			const started = await owner.start();
			expect(started.ready).toBe(true);
			const backoff = await waitForState(owner, (state) => state === "backoff");
			expect(backoff.lastExit?.classification).toBe("crash");
			expect(backoff.failure?.code).toBe("crash");
			await owner.stop();
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("classifies raw strict-config text before redaction", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stderr.write("strict-config rejected"); process.exit(2);`,
			);
			owner = createCodexProcess({
				...processOptions(root, executable),
				diagnosticSecrets: ["config"],
			});
			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			await owner.start().catch(() => undefined);
			const snapshot = await terminal;
			expect(snapshot.lastExit?.classification).toBe("strict_config");
			expect(snapshot.failure?.code).toBe("strict_config_rejected");
			expect(snapshot.stderr.text).toContain("[REDACTED]");
			expect(snapshot.stderr.text).not.toContain("config");
			await owner.stop();
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("retains inspectable bounded stderr", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stderr.write("x".repeat(${CODEX_PROCESS_STDERR_MAX_BYTES + 1024})); process.exit(17);`,
			);
			owner = createCodexProcessForTesting(processOptions(root, executable));
			const started = owner.start();
			const backoff = await waitForState(owner, (state) => state === "backoff");
			await started.catch(() => undefined);
			expect(backoff.stderr.byteLength).toBe(CODEX_PROCESS_STDERR_MAX_BYTES);
			expect(backoff.stderr.totalBytes).toBeGreaterThan(CODEX_PROCESS_STDERR_MAX_BYTES);
			expect(backoff.stderr.truncated).toBe(true);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("redacts registered secrets from stderr, failure messages, and listener snapshots", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		const published: string[] = [];
		try {
			const executable = fixture(
				root,
				`process.stderr.write("authorization=poisoned-secret"); process.exit(17);`,
			);
			owner = createCodexProcessForTesting(processOptions(root, executable));
			owner.subscribe((snapshot) => published.push(JSON.stringify(snapshot)));
			const started = owner.start();
			const backoff = await waitForState(owner, (state) => state === "backoff");
			await started.catch(() => undefined);
			expect(backoff.stderr.text).not.toContain("poisoned-secret");
			expect(backoff.stderr.text).toContain("[REDACTED]");
			expect(backoff.failure?.message).not.toContain("poisoned-secret");
			expect(backoff.failure).not.toHaveProperty("cause");
			expect(published.join("\n")).not.toContain("poisoned-secret");
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("refuses missing and wrong-version binaries before creating storage", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const wrongVersion = fixture(root, `process.exit(0);`, "poisoned-secret");
			for (const [executable, code] of [
				[wrongVersion, "binary_wrong_version"],
				[path.join(root, "missing"), "binary_missing"],
			] as const) {
				owner = createCodexProcessForTesting(processOptions(root, executable));
				let failure: unknown;
				try {
					await owner.start();
				} catch (cause) {
					failure = cause;
				}
				expect(failure).toBeInstanceOf(CodexProcessError);
				expect((failure as CodexProcessError).code).toBe(code);
				expect((failure as CodexProcessError).cause).toBeUndefined();
				expect(owner.snapshot().state).toBe("terminal_failure");
				expect(owner.snapshot().failure?.message).not.toContain("poisoned-secret");
				await owner.stop();
			}
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("releases dedicated storage when spawn itself fails", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `process.stdin.resume();`);
			const processOwner = createCodexProcess({
				...processOptions(root, executable),
				dependencies: {
					spawn: () => {
						throw new Error("injected spawn failure");
					},
				},
			});
			owner = processOwner;
			let failure: unknown;
			try {
				await processOwner.start();
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("spawn_failed");
			expect(processOwner.snapshot().state).toBe("terminal_failure");
			expect(fs.readdirSync(path.join(root, "storage", "codex-home"))).toEqual(["config.toml"]);
			await processOwner.stop();
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("refuses caller-provided daemon or extra arguments before spawn", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `process.stdin.resume();`);
			const secret = "private-extra-argument";
			owner = createCodexProcessForTesting({
				...processOptions(root, executable),
				diagnosticSecrets: [secret],
				argv: [executable, "app-server", "--listen", secret],
			});
			const processOwner = owner;
			const startPromise = processOwner.start();
			let failure: unknown;
			try {
				await startPromise;
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect(processOwner.snapshot().state).toBe("terminal_failure");
			expect(processOwner.snapshot().failure?.message).toContain("caller-supplied extra arguments");
			expect((failure as CodexProcessError).message).not.toContain(secret);
			expect(processOwner.snapshot().failure?.message).not.toContain(secret);
			await processOwner.stop();
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("retires a throwing snapshot listener and shuts down its owned child", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const secret = "throwing-subscribe-secret";
			const executable = fixture(
				root,
				`process.stdin.resume(); process.on("SIGTERM", () => process.exit(0));`,
			);
			owner = createCodexProcess({
				...processOptions(root, executable),
				diagnosticSecrets: [secret],
			});
			const published: string[] = [];
			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			owner.subscribe((snapshot) => published.push(JSON.stringify(snapshot)));
			owner.subscribe((snapshot) => {
				if (snapshot.state === "running") {
					throw new Error(secret);
				}
			});
			let failure: unknown;
			try {
				await owner.start();
			} catch (cause) {
				failure = cause;
			}
			const failed = await terminal;
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("listener_failed");
			expect((failure as CodexProcessError).message).not.toContain(secret);
			expect(failed.failure?.message).not.toContain(secret);
			expect(published.join("\n")).not.toContain(secret);
			const stopped = await owner.stop();
			expect(stopped.state).toBe("stopped");
			expect(owner.currentChild()).toBeNull();
			expect(
				fs.existsSync(path.join(root, "storage", "codex-home", ".archboard-codex-process.lock")),
			).toBe(false);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("retires a throwing child listener and shuts down its owned child", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const secret = "throwing-child-secret";
			const executable = fixture(
				root,
				`process.stdin.resume(); process.on("SIGTERM", () => process.exit(0));`,
			);
			owner = createCodexProcess({
				...processOptions(root, executable),
				diagnosticSecrets: [secret],
			});
			const published: string[] = [];
			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			owner.subscribe((snapshot) => published.push(JSON.stringify(snapshot)));
			owner.onChild(() => {
				throw new Error(secret);
			});
			let failure: unknown;
			try {
				await owner.start();
			} catch (cause) {
				failure = cause;
			}
			const failed = await terminal;
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("listener_failed");
			expect((failure as CodexProcessError).message).not.toContain(secret);
			expect(failed.failure?.message).not.toContain(secret);
			expect(published.join("\n")).not.toContain(secret);
			const stopped = await owner.stop();
			expect(stopped.state).toBe("stopped");
			expect(owner.currentChild()).toBeNull();
			expect(
				fs.existsSync(path.join(root, "storage", "codex-home", ".archboard-codex-process.lock")),
			).toBe(false);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});
});
