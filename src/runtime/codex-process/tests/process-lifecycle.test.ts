import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { CodexProcessError } from "../process.js";
import { createCodexProcessForTesting as createCodexProcess } from "../testing.js";
import { CODEX_COMPOSED_SHUTDOWN_MS, CODEX_TERM_GRACE_MS } from "../../../shared/timing/timing.js";
import {
	fixture,
	processOptions as options,
	removeRoot,
	startReady,
	temporaryRoot,
} from "./support.js";
import { driveManual, fakeLifecycle } from "./lifecycle-support.js";

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
			const child = owner.currentChild();
			if (!child) throw new Error("Expected a spawned Codex child.");
			child.lifecycle.markAppServerReady();
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

	test("releases a group observed quiescent before the child close callback", async () => {
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
			lifecycle.markGroupQuiescent();
			const stopping = owner.stop();
			lifecycle.closeChild();
			expect((await driveManual(stopping, lifecycle.clock)).state).toBe("stopped");
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
			const child = owner.currentChild();
			if (!child) throw new Error("Expected a running Codex child.");
			child.lifecycle.markTerminalFailure("protocol became terminal");
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
