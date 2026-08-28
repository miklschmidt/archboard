import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { startCountingProxy } from "../support/counting-proxy.ts";
import { startOwnedPeer } from "../support/owned-peer-process.ts";
import { ReadySchema, sanitizedEnvironment } from "../support/process-http.ts";

export const ResourceReadySchema = ReadySchema.extend({
	upstreamPort: z.number().int().positive(),
	proxyPort: z.number().int().positive(),
	lockFile: z.string(),
});
const HealthResponderReadySchema = ReadySchema.extend({ port: z.number().int().positive() });
const RawLockReadySchema = ReadySchema.extend({ lockFile: z.string() });
export type ResourceReady = z.infer<typeof ResourceReadySchema>;

export async function registerResourceSet(
	resources: AsyncDisposableStack,
	input: { root: string; vault: string; upstreamPort: number; proxyPort: number; repoRoot: string },
): Promise<ResourceReady> {
	mkdirSync(input.vault, { recursive: true });
	const env = sanitizedEnvironment(input.root, input.vault);
	const upstream = await startOwnedPeer({
		argv: [process.execPath, join(import.meta.dir, "health-responder.ts")],
		env: { ...env, PORT: String(input.upstreamPort) },
		readySchema: HealthResponderReadySchema,
	});
	resources.defer(() => upstream.dispose());
	const lock = await startOwnedPeer({
		argv: [process.execPath, import.meta.filename],
		env: {
			...env,
			ARCHBOARD_TEST_RESOURCE_MODE: "lock",
			ARCHBOARD_TEST_REPO_ROOT: input.repoRoot,
		},
		readySchema: RawLockReadySchema,
	});
	resources.defer(() => lock.dispose());
	const proxy = await startCountingProxy({
		port: input.proxyPort,
		upstream: `http://127.0.0.1:${input.upstreamPort}`,
		env,
	});
	resources.defer(() => proxy.dispose());
	return {
		pid: process.pid,
		upstreamPort: input.upstreamPort,
		proxyPort: input.proxyPort,
		lockFile: (lock.ready as { lockFile: string }).lockFile,
	};
}

async function lockMode(): Promise<void> {
	const repoRoot = process.env.ARCHBOARD_TEST_REPO_ROOT;
	if (!repoRoot) throw new Error("ARCHBOARD_TEST_REPO_ROOT is required.");
	const { holdBoard, releaseHold } = await import(
		join(repoRoot, "src/runtime/engine/board-lock.ts")
	);
	const board = process.env.ARCHBOARD_TEST_LOCK_BOARD ?? "resource-cleanup";
	await holdBoard({
		board,
		holder: { id: "resource-owner", kind: "agent" },
		waitMs: 0,
	});
	const lockFile = join(process.env.ARCHBOARD_VAULT!, ".archboard/locks", `${board}.lock`);
	// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
	console.log(JSON.stringify({ pid: process.pid, lockFile }));
	const renewal = setInterval(() => {
		void holdBoard({
			board,
			holder: { id: "resource-owner", kind: "agent" },
			waitMs: 0,
		});
	}, 800);
	const stop = () => {
		clearInterval(renewal);
		releaseHold(board, "resource-owner");
		process.exit(0);
	};
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}

async function outerMode(): Promise<void> {
	const root = process.env.ARCHBOARD_TEST_ROOT!;
	const vault = join(root, "vault");
	const resources = new AsyncDisposableStack();
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	let stopping = false;
	const stop = async () => {
		if (stopping) return;
		stopping = true;
		await resources.disposeAsync();
		process.exit(0);
	};
	process.on("SIGTERM", () => void stop());
	process.on("SIGINT", () => void stop());
	const ready = await registerResourceSet(resources, {
		root,
		vault,
		upstreamPort: Number(process.env.ARCHBOARD_TEST_UPSTREAM_PORT),
		proxyPort: Number(process.env.ARCHBOARD_TEST_PROXY_PORT),
		repoRoot: process.env.ARCHBOARD_TEST_REPO_ROOT!,
	});
	// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
	console.log(JSON.stringify(ready));
}

if (import.meta.main) {
	if (process.env.ARCHBOARD_TEST_RESOURCE_MODE === "lock") await lockMode();
	else await outerMode();
}
