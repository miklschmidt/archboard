import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { ResourceReadySchema, registerResourceSet } from "./fixtures/process-resource-owner.ts";
import { startOwnedPeer } from "./support/owned-peer-process.ts";
import { availablePort, portIsReusable, sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

test("assertion and signal cleanup reap every task-owned resource", async () => {
	const directRoot = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-direct-"));
	const directVault = join(directRoot, "vault");
	const directUpstream = await availablePort();
	const directProxy = await availablePort();
	let directReady: { lockFile: string } | undefined;
	try {
		await using resources = new AsyncDisposableStack();
		resources.defer(async () => {
			const { rmSync } = await import("node:fs");
			rmSync(directRoot, { recursive: true, force: true });
		});
		directReady = await registerResourceSet(resources, {
			root: directRoot,
			vault: directVault,
			upstreamPort: directUpstream,
			proxyPort: directProxy,
			repoRoot,
		});
		throw new Error("forced owner assertion");
	} catch (error) {
		expect((error as Error).message).toBe("forced owner assertion");
	}
	expect(directReady).toBeDefined();
	expect(existsSync(directReady!.lockFile)).toBeFalse();
	expect(existsSync(directRoot)).toBeFalse();
	expect(await portIsReusable(directUpstream)).toBeTrue();
	expect(await portIsReusable(directProxy)).toBeTrue();

	const outerRoot = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-outer-"));
	const outerVault = join(outerRoot, "vault");
	const outerUpstream = await availablePort();
	const outerProxy = await availablePort();
	const owner = await startOwnedPeer({
		argv: [process.execPath, join(import.meta.dir, "fixtures/process-resource-owner.ts")],
		env: {
			...sanitizedEnvironment(outerRoot, outerVault),
			ARCHBOARD_TEST_ROOT: outerRoot,
			ARCHBOARD_TEST_UPSTREAM_PORT: String(outerUpstream),
			ARCHBOARD_TEST_PROXY_PORT: String(outerProxy),
			ARCHBOARD_TEST_REPO_ROOT: repoRoot,
		},
		readySchema: ResourceReadySchema,
	});
	const lockFile = owner.ready.lockFile;
	expect(existsSync(lockFile)).toBeTrue();
	owner.child.kill("SIGTERM");
	const exit = await owner.exit;
	expect(exit.code).toBe(0);
	expect(existsSync(lockFile)).toBeFalse();
	expect(existsSync(outerRoot)).toBeFalse();
	expect(await portIsReusable(outerUpstream)).toBeTrue();
	expect(await portIsReusable(outerProxy)).toBeTrue();
}, 20_000);
