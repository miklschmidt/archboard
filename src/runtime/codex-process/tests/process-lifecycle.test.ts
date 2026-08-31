import { describe, expect, test } from "bun:test";
import type { ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { CODEX_APP_SERVER_ARGUMENTS, CodexProcessError, createCodexProcess } from "../index.js";
import { CODEX_COMPOSED_SHUTDOWN_MS, CODEX_TERM_GRACE_MS } from "../../../shared/timing/timing.js";

function temporaryRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "archboard-codex-process-lifecycle-"));
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

function startReady(
	owner: ReturnType<typeof createCodexProcess>,
): Promise<ReturnType<typeof owner.snapshot>> {
	owner.onChild(() => owner.markAppServerReady());
	return owner.start();
}

type FakeChild = ChildProcessByStdio<PassThrough, PassThrough, PassThrough>;
type TestTimer = ReturnType<typeof setTimeout>;

interface ManualScheduler {
	readonly now: () => number;
	readonly schedule: (callback: () => void, delayMs: number) => TestTimer;
	readonly cancel: (timer: TestTimer) => void;
	readonly runNext: () => boolean;
}

function manualScheduler(): ManualScheduler {
	let time = 0;
	let sequence = 0;
	const timers = new Map<
		TestTimer,
		{ readonly at: number; readonly order: number; readonly callback: () => void }
	>();
	const schedule = (callback: () => void, delayMs: number): TestTimer => {
		const timer = {} as TestTimer;
		timers.set(timer, { at: time + delayMs, order: sequence++, callback });
		return timer;
	};
	const cancel = (timer: TestTimer): void => {
		timers.delete(timer);
	};
	const runNext = (): boolean => {
		const next = [...timers.entries()].toSorted(
			([, left], [, right]) => left.at - right.at || left.order - right.order,
		)[0];
		if (!next) return false;
		timers.delete(next[0]);
		time = next[1].at;
		next[1].callback();
		return true;
	};
	return Object.freeze({ now: () => time, schedule, cancel, runNext });
}

function fakeChild(pid: number): FakeChild {
	const child = new EventEmitter() as unknown as FakeChild;
	Object.assign(child, {
		pid,
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: () => true,
	});
	return child;
}

function fakeLifecycle(autoSpawn = true, closeOnKill = true) {
	const clock = manualScheduler();
	let child: FakeChild | undefined;
	let groupStatus: "owned" | "quiescent" | "reused" | "unproven" = "owned";
	const signals: string[] = [];
	const dependencies = {
		spawn: () => {
			child = fakeChild(40_001);
			if (autoSpawn) queueMicrotask(() => child?.emit("spawn"));
			return child!;
		},
		processGroup: {
			capture: (leaderPid: number) => ({
				leaderPid,
				pgid: leaderPid,
				leaderStartTime: "test-start",
			}),
			inspect: () => groupStatus,
			signal: (_identity: unknown, signal: "SIGTERM" | "SIGKILL") => {
				signals.push(signal);
				if (signal === "SIGKILL" && closeOnKill) {
					groupStatus = "quiescent";
					child?.emit("close", null, "SIGKILL");
				}
			},
		},
		now: clock.now,
		schedule: clock.schedule,
		cancel: clock.cancel,
	};
	return Object.freeze({
		clock,
		dependencies,
		signals,
		child: () => child,
		quiesce: () => {
			groupStatus = "quiescent";
			child?.emit("close", null, "SIGKILL");
		},
		reuse: () => {
			groupStatus = "reused";
		},
	});
}

async function driveManual<T>(promise: Promise<T>, clock: ManualScheduler): Promise<T> {
	let settled = false;
	void promise.then(
		() => {
			settled = true;
			return undefined;
		},
		() => {
			settled = true;
			return undefined;
		},
	);
	for (let turn = 0; turn < 32; turn += 1) {
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		if (settled) break;
		clock.runNext();
	}
	return promise;
}

describe("Codex process lifecycle", () => {
	test("keeps start pending until the typed app-server readiness acknowledgement", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			const started = owner.start();
			let settled = false;
			void started.then(
				() => {
					settled = true;
					return undefined;
				},
				() => {
					settled = true;
					return undefined;
				},
			);
			await Promise.resolve();
			await Promise.resolve();
			expect(owner.snapshot().state).toBe("running");
			expect(owner.snapshot().ready).toBe(false);
			expect(settled).toBe(false);
			owner.markAppServerReady();
			expect((await started).ready).toBe(true);
			await driveManual(owner.stop(), lifecycle.clock);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("settles readiness timeout as a typed terminal failure and then stops", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			const started = owner.start();
			await Promise.resolve();
			await Promise.resolve();
			expect(owner.snapshot().ready).toBe(false);
			expect(lifecycle.clock.runNext()).toBe(true);
			let failure: unknown;
			try {
				await started;
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("startup_timeout");
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(stopped.failure?.code).toBe("startup_timeout");
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("settles a pending start exactly once when stop races a delayed spawn event", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle(false);
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			const started = owner.start();
			expect(owner.snapshot().state).toBe("starting");
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			let failure: unknown;
			try {
				await started;
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("shutdown_failed");
			expect(stopped.state).toBe("stopped");
			lifecycle.child()?.emit("spawn");
			await Promise.resolve();
			expect(owner.snapshot().state).toBe("stopped");
			expect(owner.currentChild()).toBeNull();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("refuses to signal a process group after its identity is reported reused", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			lifecycle.reuse();
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			let failure: unknown;
			try {
				await driveManual(owner.stop(), lifecycle.clock);
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("shutdown_failed");
			expect(lifecycle.signals).toEqual([]);
			expect(owner.snapshot().state).toBe("terminal_failure");
			expect(owner.currentChild()).not.toBeNull();
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("does not claim stopped when the child or KILL cleanup cannot settle", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle(true, false);
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			let failure: unknown;
			try {
				await driveManual(owner.stop(), lifecycle.clock);
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("shutdown_failed");
			expect(owner.snapshot().state).toBe("terminal_failure");
			expect(owner.snapshot().failure?.message).toContain("Recovery");
			expect(owner.currentChild()).not.toBeNull();
			lifecycle.quiesce();
			expect((await driveManual(owner.stop(), lifecycle.clock)).state).toBe("stopped");
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("retains process storage when lock cleanup fails and retries it on the next stop", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			let remainingFailures = 2;
			let releaseAttempts = 0;
			const prepared = {
				codexHome: path.join(root, "codex-home"),
				sqliteHome: path.join(root, "sqlite-home"),
				configPath: path.join(root, "codex-home", "config.toml"),
				configText: 'sqlite_home = "sqlite-home"\n',
				release: () => {
					releaseAttempts += 1;
					if (remainingFailures > 0) {
						remainingFailures -= 1;
						throw new Error("injected unlink failure");
					}
				},
			};
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: { ...lifecycle.dependencies, prepareStorage: () => prepared },
			});
			await startReady(owner);
			let failure: unknown;
			try {
				await driveManual(owner.stop(), lifecycle.clock);
			} catch (cause) {
				failure = cause;
			}
			expect(failure).toBeInstanceOf(CodexProcessError);
			expect((failure as CodexProcessError).code).toBe("shutdown_failed");
			expect(owner.snapshot().state).toBe("terminal_failure");
			expect(releaseAttempts).toBe(2);
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(releaseAttempts).toBe(3);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test(
		"retains group ownership after a leader exits and kills its TERM-resistant descendant",
		async () => {
			const root = temporaryRoot();
			let owner: ReturnType<typeof createCodexProcess> | undefined;
			let descendantPid: number | undefined;
			try {
				const executable = fixture(
					root,
					`const { spawn } = require("node:child_process"); const descendant = spawn(process.execPath, ["-e", "process.on(\\"SIGTERM\\", () => {}); setInterval(() => {}, 1000);"], { stdio: "ignore" }); process.stdout.write(String(descendant.pid)); process.exit(17);`,
				);
				owner = createCodexProcess(options(root, executable));
				const descendant = new Promise<number>((resolve) => {
					owner!.onChild((child) => {
						child.stdout.once("data", (chunk) => resolve(Number(chunk.toString())));
					});
				});
				const started = owner.start();
				const cleanup = await new Promise<ReturnType<typeof owner.snapshot>>((resolve) => {
					const unsubscribe = owner!.subscribe((snapshot) => {
						if (snapshot.state !== "group_cleanup") return;
						unsubscribe();
						resolve(snapshot);
					});
				});
				descendantPid = await descendant;
				await started.catch(() => undefined);
				expect(cleanup.ready).toBe(false);
				expect(cleanup.failure).toBeNull();
				const stopped = await owner.stop();
				expect(stopped.state).toBe("stopped");
				expect(stopped.lastExit?.classification).toBe("early_exit");
				let descendantState: string | undefined;
				try {
					const stat = fs.readFileSync(`/proc/${descendantPid}/stat`, "utf8");
					descendantState = stat
						.slice(stat.lastIndexOf(")") + 2)
						.trim()
						.split(/\s+/u)[0];
				} catch {
					descendantState = undefined;
				}
				expect([undefined, "Z", "X"]).toContain(descendantState);
			} finally {
				if (descendantPid !== undefined) {
					try {
						process.kill(descendantPid, "SIGKILL");
					} catch {
						/* The group cleanup already killed the fixture. */
					}
				}
				if (owner) await owner.stop().catch(() => undefined);
				removeRoot(root);
			}
		},
		CODEX_COMPOSED_SHUTDOWN_MS + CODEX_TERM_GRACE_MS,
	);

	test("sends TERM, then KILL, to a child that refuses TERM", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			const executable = fixture(root, `process.on("SIGTERM", () => {}); process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(lifecycle.signals).toEqual(["SIGTERM", "SIGKILL"]);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("lets an active terminal failure finish owned shutdown before stopped", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			const executable = fixture(root, `process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			owner.markTerminalFailure("protocol became terminal");
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(stopped.failure?.code).toBe("strict_config_rejected");
			expect(owner.currentChild()).toBeNull();
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});
});
