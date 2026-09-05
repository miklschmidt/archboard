import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { projectBoardRenderSnapshot } from "../../../runtime/engine/board-io.ts";
import { extractSceneJsonFromObsidianMd } from "../../../runtime/engine/obsidian-md.ts";
import {
	TEST_BOARD_RENDERER_OWNER_TIMEOUT_MS,
	TEST_BOARD_RENDERER_STARTUP_FAILURE_TIMEOUT_MS,
} from "../../../shared/timing/timing.ts";
import {
	BoardRendererError,
	createBoardRenderingOwner,
	DEFAULT_MERMAID_CONFIG,
	type BoardRenderSnapshot,
} from "../index.ts";

const repositoryRoot = resolve(import.meta.dir, "../../../..");

function renderSnapshot(): BoardRenderSnapshot {
	const note = readFileSync(
		join(repositoryRoot, "docs/design/server-rendering-boundary-fixtures/board.excalidraw.md"),
		"utf8",
	);
	const scene: unknown = JSON.parse(extractSceneJsonFromObsidianMd(note));
	const snapshot = projectBoardRenderSnapshot(scene);
	if (!snapshot) {
		throw new Error("Render fixture does not project to a renderer snapshot.");
	}
	return snapshot;
}

async function loopbackPortIsFree(port: number): Promise<boolean> {
	let server: ReturnType<typeof Bun.serve> | null = null;
	try {
		server = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("probe") });
		return true;
	} catch {
		return false;
	} finally {
		if (server) {
			await server.stop(true);
		}
	}
}

const mermaidJob = {
	kind: "mermaid" as const,
	source: "graph TD; A --> B;",
	config: DEFAULT_MERMAID_CONFIG,
};

describe("board renderer owner", () => {
	test(
		"retries partial fixture acquisition and proves typed failure, cancellation, and cleanup",
		async () => {
			let fixtureStarts = 0;
			let failedFixturePort = 0;
			let injectCleanupFailure = true;
			let pauseNextCdpJob = false;
			let reportPausedCdp!: (pid: number) => void;
			const pausedCdp = new Promise<number>((resolvePausedCdp) => {
				reportPausedCdp = resolvePausedCdp;
			});
			const chromiumStarts: number[] = [];
			const roots: string[] = [];
			const owner = createBoardRenderingOwner({
				testHooks: {
					afterListen(fixture) {
						fixtureStarts += 1;
						if (fixtureStarts === 1) {
							failedFixturePort = fixture.port;
							throw new Error("injected fixture listen failure");
						}
					},
					onChromiumStart: (pid) => chromiumStarts.push(pid),
					onTempRoot: (root) => roots.push(root),
					adjustSessionCleanup(cleanup) {
						if (!injectCleanupFailure) {
							return cleanup;
						}
						injectCleanupFailure = false;
						return {
							...cleanup,
							clean: false,
							errors: [...cleanup.errors, "injected cleanup audit failure"],
						};
					},
					afterCdpDispatch(_job, pid) {
						if (!pauseNextCdpJob) {
							return;
						}
						pauseNextCdpJob = false;
						process.kill(-pid, "SIGSTOP");
						reportPausedCdp(pid);
					},
				},
			});
			owner.start();

			await expect(owner.execute(mermaidJob)).rejects.toBeInstanceOf(BoardRendererError);
			expect(fixtureStarts).toBe(1);
			expect(await loopbackPortIsFree(failedFixturePort)).toBeTrue();
			expect(chromiumStarts).toHaveLength(0);

			await owner.execute(mermaidJob);
			const first = owner.status();
			if (!first.chromiumPid || !first.tempRoot || !first.profile || !first.controlPort) {
				throw new Error("The renderer did not expose its owned resource identity.");
			}
			expect(first.profile.startsWith(`${first.tempRoot}/`)).toBeTrue();
			const failed = await owner
				.execute({
					kind: "render",
					snapshot: renderSnapshot(),
					outputs: [
						{
							id: "complete-first",
							kind: "full",
							format: "svg",
							background: true,
							padding: 16,
							scale: 1,
						},
						{
							id: "fail-second",
							kind: "focus",
							format: "png",
							background: true,
							frame: { x: 0, y: 0, width: 1, height: 1 },
							width: 0,
							height: 0,
							scale: 1,
						},
					],
				})
				.catch((error: unknown) => error);
			expect(failed).toBeInstanceOf(BoardRendererError);
			expect(failed).toHaveProperty("code", "BOARD_RENDERER_FAILED");
			expect(failed).toHaveProperty(
				"message",
				expect.stringContaining("injected cleanup audit failure"),
			);
			expect(existsSync(first.tempRoot)).toBeFalse();

			await owner.execute(mermaidJob);
			const replacement = owner.status();
			if (!replacement.chromiumPid || !replacement.tempRoot) {
				throw new Error("The replacement renderer did not expose its owned identity.");
			}
			expect(replacement.chromiumPid).not.toBe(first.chromiumPid);
			expect(replacement.tempRoot).not.toBe(first.tempRoot);

			pauseNextCdpJob = true;
			const activeController = new AbortController();
			const active = owner.execute(mermaidJob, activeController.signal);
			const pausedPid = await pausedCdp;
			const queued = owner.execute(mermaidJob);
			const activeWhilePaused = owner.status().active;
			const queuedWhilePaused = owner.status().queued;
			const cancellation = new DOMException("cancel active CDP conversion", "AbortError");
			activeController.abort(cancellation);
			const stopping = owner.stop();
			process.kill(-pausedPid, "SIGCONT");
			const [activeFailure, queuedFailure, cleanup] = await Promise.all([
				active.catch((error: unknown) => error),
				queued.catch((error: unknown) => error),
				stopping,
			]);
			expect(pausedPid).toBe(replacement.chromiumPid);
			expect(activeWhilePaused).toBeTrue();
			expect(queuedWhilePaused).toBe(1);
			expect(activeFailure).toBe(cancellation);
			expect(queuedFailure).toBeInstanceOf(BoardRendererError);
			expect(queuedFailure).toHaveProperty("phase", "shutdown");
			expect(fixtureStarts).toBe(2);
			expect(chromiumStarts).toHaveLength(2);
			expect(owner.status().chromiumStarts).toBe(2);
			expect(roots).toHaveLength(2);
			expect(cleanup).toEqual({
				clean: true,
				pids: expect.any(Array),
				processesGone: true,
				survivors: [],
				groupAbsent: true,
				leaderSettled: true,
				stdoutSettled: true,
				stderrSettled: true,
				profileRemoved: true,
				tempRootRemoved: true,
				portReleased: true,
				fixtureClosed: true,
				errors: [],
			});
			for (const root of roots) {
				expect(existsSync(root)).toBeFalse();
			}
			expect(owner.lastCleanup()).toEqual(cleanup);
			expect(await owner.stop()).toEqual(cleanup);
		},
		TEST_BOARD_RENDERER_OWNER_TIMEOUT_MS,
	);

	test(
		"startup diagnostics include bounded process output and remove the exact temp root",
		async () => {
			const directory = mkdtempSync(join(tmpdir(), "archboard-renderer-startup-failure-"));
			try {
				const executable = join(directory, "failing-chromium");
				writeFileSync(
					executable,
					"#!/bin/sh\nprintf 'renderer-startup-tail\\n' >&2\nsleep 0.2\nexit 23\n",
				);
				chmodSync(executable, 0o700);
				let root = "";
				const owner = createBoardRenderingOwner({
					chromiumPath: executable,
					startupTimeoutMs: 1_000,
					cleanupTimeoutMs: 1_000,
					testHooks: { onTempRoot: (value) => (root = value) },
				});
				owner.start();
				const failed = await owner.execute(mermaidJob).catch((error: unknown) => error);
				expect(failed).toBeInstanceOf(BoardRendererError);
				expect(failed).toHaveProperty("message", expect.stringContaining("renderer-startup-tail"));
				expect(root).not.toBe("");
				expect(existsSync(root)).toBeFalse();
				const cleanup = await owner.stop();
				expect(cleanup.tempRootRemoved).toBeTrue();
				expect(cleanup.fixtureClosed).toBeTrue();
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
		TEST_BOARD_RENDERER_STARTUP_FAILURE_TIMEOUT_MS,
	);
});
