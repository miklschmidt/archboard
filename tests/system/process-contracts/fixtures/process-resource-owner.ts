import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { startCountingProxy } from "../support/counting-proxy.ts";
import { startOwnedPeer } from "../support/owned-peer-process.ts";
import { ReadySchema, sanitizedEnvironment } from "../support/process-http.ts";

const ResourceReadySchema = ReadySchema.extend({
	upstreamPort: z.number().int().positive(),
	proxyPort: z.number().int().positive(),
	lockFile: z.string(),
	lockProcess: z.string(),
});
const HealthResponderReadySchema = ReadySchema.extend({ port: z.number().int().positive() });
const RawLockReadySchema = ReadySchema.extend({
	lockFile: z.string(),
	process: z.string(),
	port: z.number().int().positive().optional(),
});

async function registerResourceSet(
	resources: AsyncDisposableStack,
	input: {
		root: string;
		vault: string;
		upstreamPort: number;
		proxyPort: number;
		repoRoot: string;
		failAfterLock?: boolean;
	},
): Promise<z.infer<typeof ResourceReadySchema>> {
	mkdirSync(input.vault, { recursive: true });
	const env = sanitizedEnvironment(input.root);
	const acquired = new AsyncDisposableStack();
	try {
		const upstream = await startOwnedPeer({
			argv: [process.execPath, join(import.meta.dir, "health-responder.ts")],
			env: { ...env, PORT: String(input.upstreamPort) },
			readySchema: HealthResponderReadySchema,
		});
		acquired.defer(() => upstream.dispose());
		const lock = await startOwnedPeer({
			argv: [
				process.execPath,
				join(input.repoRoot, "packages/board/tests/runtime/support/process-lock.ts"),
			],
			env: {
				...env,
				ARCHBOARD_TEST_RESOURCE_MODE: "lock",
				ARCHBOARD_TEST_REPO_ROOT: input.repoRoot,
				ARCHBOARD_TEST_LOCK_VAULT: input.vault,
			},
			readySchema: RawLockReadySchema,
		});
		acquired.defer(() => lock.dispose());
		if (input.failAfterLock) {
			throw new Error("forced failure after lock acquisition");
		}
		const proxy = await startCountingProxy({
			port: input.proxyPort,
			upstream: `http://127.0.0.1:${input.upstreamPort}`,
			env,
		});
		acquired.defer(() => proxy.dispose());
		resources.defer(() => acquired.disposeAsync());
		return {
			pid: process.pid,
			upstreamPort: input.upstreamPort,
			proxyPort: input.proxyPort,
			lockFile: (lock.ready as { lockFile: string }).lockFile,
			lockProcess: lock.ready.process,
		};
	} catch (error) {
		await acquired.disposeAsync();
		throw error;
	}
}

async function outerMode(): Promise<void> {
	const root = process.env["ARCHBOARD_TEST_ROOT"]!;
	const resources = new AsyncDisposableStack();
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	let setup: Promise<z.infer<typeof ResourceReadySchema>> | undefined;
	let stopping: Promise<void> | undefined;
	let disposal: Promise<void> | undefined;
	let signalRequested = false;
	const dispose = () => (disposal ??= resources.disposeAsync());
	const stop = (): Promise<void> => {
		signalRequested = true;
		stopping ??= (async () => {
			try {
				await setup;
			} catch {
				// Setup failure is reported by the main path after cleanup.
			}
			await dispose();
			process.exit(0);
		})();
		return stopping;
	};
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.on(signal, () => void stop());
	}
	try {
		setup = registerResourceSet(resources, {
			root,
			vault: join(root, "vault"),
			upstreamPort: Number(process.env["ARCHBOARD_TEST_UPSTREAM_PORT"]),
			proxyPort: Number(process.env["ARCHBOARD_TEST_PROXY_PORT"]),
			repoRoot: process.env["ARCHBOARD_TEST_REPO_ROOT"]!,
			failAfterLock: process.env["ARCHBOARD_TEST_FAIL_AFTER_LOCK"] === "1",
		});
		const ready = await setup;
		if (signalRequested) {
			return await stop();
		}
		// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
		console.log(JSON.stringify(ready));
	} catch (error) {
		await dispose();
		throw error;
	}
}

if (import.meta.main) {
	await outerMode();
}

export { ResourceReadySchema, RawLockReadySchema, registerResourceSet };
