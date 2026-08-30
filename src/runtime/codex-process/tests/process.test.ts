import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	createCodexProcess,
	CodexProcessError,
} from "../index.js";
import {
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_TERM_GRACE_MS,
} from "../../../shared/timing/timing.js";

function temporaryRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "archboard-codex-process-test-"));
}

function removeRoot(root: string): void {
	fs.rmSync(root, { recursive: true, force: true });
}

function fixture(root: string, body: string, version = "codex-cli 0.151.0"): string {
	const executable = path.join(root, "codex-fixture");
	writeFileSync(
		executable,
		`#!${process.execPath}\nif (process.argv[2] === "--version") { console.log(${JSON.stringify(version)}); process.exit(0); }\nif (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify([...CODEX_APP_SERVER_ARGUMENTS]))}) { console.error("argv rejected"); process.exit(9); }\n${body}\n`,
		{ mode: 0o700 },
	);
	chmodSync(executable, 0o700);
	return executable;
}

function options(root: string, executablePath: string) {
	return {
		executablePath,
		checkoutRoot: process.cwd(),
		storage: { rootDirectory: path.join(root, "storage") },
		ambientEnvironment: {
			HOME: "/poisoned/home",
			PATH: process.env.PATH ?? "",
			CODEX_HOME: "/poisoned/codex-home",
			OPENAI_API_KEY: "poisoned-secret",
			PWD: "/poisoned/pwd",
		},
	};
}

function waitForState(
	owner: ReturnType<typeof createCodexProcess>,
	predicate: (state: ReturnType<typeof owner.snapshot>["state"]) => boolean,
): Promise<ReturnType<typeof owner.snapshot>> {
	const current = owner.snapshot();
	if (predicate(current.state)) return Promise.resolve(current);
	return new Promise((resolve) => {
		const unsubscribe = owner.subscribe((snapshot) => {
			if (!predicate(snapshot.state)) return;
			unsubscribe();
			resolve(snapshot);
		});
	});
}

describe("Codex process owner", () => {
	test("spawns the exact app-server argv and closed child environment", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`console.log(JSON.stringify({ argv: process.argv.slice(2), keys: Object.keys(process.env), home: process.env.CODEX_HOME, sqlite: process.env.CODEX_SQLITE_HOME, pwd: process.env.PWD, secret: process.env.OPENAI_API_KEY })); process.stdin.resume(); process.on("SIGTERM", () => process.exit(0));`,
			);
			const processOwner = createCodexProcess(options(root, executable));
			owner = processOwner;
			const output = new Promise<Record<string, unknown>>((resolve) => {
				const unsubscribe = processOwner.onChild((child) => {
					child.stdout.once("data", (chunk) => {
						unsubscribe();
						resolve(JSON.parse(chunk.toString()) as Record<string, unknown>);
					});
				});
			});
			const started = await processOwner.start();
			const observed = await output;
			expect(started.state).toBe("running");
			expect(started.argv).toEqual([executable, ...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed.argv).toEqual([...CODEX_APP_SERVER_ARGUMENTS]);
			expect(observed.keys).toEqual(["HOME", "PATH", "CODEX_HOME", "CODEX_SQLITE_HOME"]);
			expect(observed.home).toBe(path.join(root, "storage", "codex-home"));
			expect(observed.pwd).toBeUndefined();
			expect(observed.secret).toBeUndefined();
			expect(processOwner.snapshot().stderr.totalBytes).toBe(0);
			const stopped = await processOwner.stop();
			expect(stopped.state).toBe("stopped");
			expect(stopped.lastExit?.classification).toBe("requested");
			expect(await processOwner.stop()).toBe(stopped);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("enters bounded backoff after an early crash and doubles only across failures", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `console.error("crash fixture"); process.exit(17);`);
			owner = createCodexProcess(options(root, executable));
			const started = owner.start();
			const backoff = await waitForState(owner, (state) => state === "backoff");
			await started.catch(() => undefined);
			expect(backoff.failure?.code).toBe("crash");
			expect(backoff.restartAttempt).toBe(1);
			expect(backoff.restartDelayMs).toBe(CODEX_PROCESS_RESTART_BASE_MS);
			await owner.stop();
			expect(owner.snapshot().state).toBe("stopped");
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
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
			owner = createCodexProcess(options(root, executable));
			await owner.start();
			owner.markAccountReady();
			expect(owner.snapshot().accountReady).toBe(true);
			const child = owner.currentChild();
			if (!child) throw new Error("Expected a running Codex child.");
			process.kill(child.pid, "SIGKILL");
			const backoff = await waitForState(owner, (state) => state === "backoff");
			expect(backoff.accountReady).toBe(false);
			expect(backoff.restartAttempt).toBe(1);
			expect(backoff.restartDelayMs).toBe(CODEX_PROCESS_RESTART_BASE_MS);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("makes strict-config rejection terminal and drains stderr within the cap", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.stderr.write("strict-config rejected: extra argument\\n"); process.exit(2);`,
			);
			owner = createCodexProcess({
				...options(root, executable),
				stderrLimitBytes: CODEX_PROCESS_STDERR_MAX_BYTES,
			});
			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			await owner.start();
			const snapshot = await terminal;
			expect(snapshot.failure?.code).toBe("strict_config_rejected");
			expect(snapshot.lastExit?.classification).toBe("strict_config");
			expect(snapshot.stderr.text).toContain("strict-config rejected");
			await owner.stop();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
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
			owner = createCodexProcess(options(root, executable));
			const started = owner.start();
			const backoff = await waitForState(owner, (state) => state === "backoff");
			await started.catch(() => undefined);
			expect(backoff.stderr.byteLength).toBe(CODEX_PROCESS_STDERR_MAX_BYTES);
			expect(backoff.stderr.totalBytes).toBeGreaterThan(CODEX_PROCESS_STDERR_MAX_BYTES);
			expect(backoff.stderr.truncated).toBe(true);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("sends TERM, then KILL, to a child that refuses TERM", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.on("SIGTERM", () => {}); process.stdin.resume(); setInterval(() => {}, ${CODEX_TERM_GRACE_MS});`,
			);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: { schedule: (callback) => setTimeout(callback, 0) },
			});
			await owner.start();
			const pid = owner.snapshot().pid;
			expect(pid).toBeNumber();
			const stopped = await owner.stop();
			expect(stopped.state).toBe("stopped");
			expect(stopped.lastExit?.classification).toBe("requested");
			expect(owner.currentChild()).toBeNull();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("refuses missing and wrong-version binaries before creating storage", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const wrongVersion = fixture(root, `process.exit(0);`, "codex-cli 0.150.0");
			for (const [executable, code] of [
				[wrongVersion, "binary_wrong_version"],
				[path.join(root, "missing"), "binary_missing"],
			] as const) {
				owner = createCodexProcess(options(root, executable));
				let failure: unknown;
				try {
					await owner.start();
				} catch (cause) {
					failure = cause;
				}
				expect(failure).toBeInstanceOf(CodexProcessError);
				expect((failure as CodexProcessError).code).toBe(code);
				expect(owner.snapshot().state).toBe("terminal_failure");
				await owner.stop();
			}
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("releases dedicated storage when spawn itself fails", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `process.stdin.resume();`);
			const processOwner = createCodexProcess({
				...options(root, executable),
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
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("terminal failure owns shutdown of an active child", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(
				root,
				`process.on("SIGTERM", () => {}); process.stdin.resume(); setInterval(() => {}, ${CODEX_TERM_GRACE_MS});`,
			);
			const processOwner = createCodexProcess({
				...options(root, executable),
				dependencies: { schedule: (callback) => setTimeout(callback, 0) },
			});
			owner = processOwner;
			await processOwner.start();
			processOwner.markTerminalFailure("protocol became terminal");
			const stopped = await waitForState(processOwner, (state) => state === "stopped");
			expect(stopped.failure?.code).toBe("strict_config_rejected");
			expect(processOwner.currentChild()).toBeNull();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("refuses caller-provided daemon or extra arguments before spawn", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				argv: [executable, "app-server", "--listen", "unix:///tmp/codex.sock"],
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
			expect(processOwner.snapshot().failure?.message).toContain("--listen");
			await processOwner.stop();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});
});
