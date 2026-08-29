import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { ResourceReadySchema, registerResourceSet } from "./fixtures/process-resource-owner.ts";
import { runOwnedPeerToExit, startOwnedPeer } from "./support/owned-peer-process.ts";
import { availablePort, portIsReusable, sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/process-resource-owner.ts");
const lockFileFor = (vault: string) => join(vault, ".archboard/locks/resource-cleanup.lock");

test("direct assertion cleanup reaps every registered resource", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-direct-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const upstreamPort = await availablePort();
	const proxyPort = await availablePort();
	let lockFile: string | undefined;
	try {
		try {
			lockFile = (
				await registerResourceSet(resources, {
					root,
					vault,
					upstreamPort,
					proxyPort,
					repoRoot,
				})
			).lockFile;
			throw new Error("forced owner assertion");
		} catch (error) {
			expect((error as Error).message).toBe("forced owner assertion");
		}
		expect(lockFile).toBeDefined();
		expect(existsSync(lockFile!)).toBeTrue();
	} finally {
		await resources.disposeAsync();
	}
	expect(existsSync(lockFile!)).toBeFalse();
	expect(existsSync(root)).toBeFalse();
	expect(await portIsReusable(upstreamPort)).toBeTrue();
	expect(await portIsReusable(proxyPort)).toBeTrue();
}, 20_000);

test("later acquisition failure disposes earlier listener and lease before readiness", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-failure-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const upstreamPort = await availablePort();
	const proxyPort = await availablePort();
	try {
		let failure: unknown;
		try {
			await registerResourceSet(resources, {
				root,
				vault,
				upstreamPort,
				proxyPort,
				repoRoot,
				failAfterLock: true,
			});
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toBe("forced failure after lock acquisition");
		expect(existsSync(lockFileFor(vault))).toBeFalse();
		expect(await portIsReusable(upstreamPort)).toBeTrue();
		expect(await portIsReusable(proxyPort)).toBeTrue();
	} finally {
		await resources.disposeAsync();
	}
	expect(existsSync(root)).toBeFalse();
}, 20_000);

test("outer SIGTERM serializes setup and cleans its retained resources", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-outer-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const upstreamPort = await availablePort();
	const proxyPort = await availablePort();
	try {
		const owner = await startOwnedPeer({
			argv: [process.execPath, fixture],
			env: {
				...sanitizedEnvironment(root, vault),
				ARCHBOARD_TEST_ROOT: root,
				ARCHBOARD_TEST_UPSTREAM_PORT: String(upstreamPort),
				ARCHBOARD_TEST_PROXY_PORT: String(proxyPort),
				ARCHBOARD_TEST_REPO_ROOT: repoRoot,
			},
			readySchema: ResourceReadySchema,
		});
		resources.defer(() => owner.dispose());
		expect(existsSync(owner.ready.lockFile)).toBeTrue();
		owner.child.kill("SIGTERM");
		expect(await owner.exit).toEqual({ code: 0, signal: null });
		expect(existsSync(owner.ready.lockFile)).toBeFalse();
		expect(existsSync(root)).toBeFalse();
		expect(await portIsReusable(upstreamPort)).toBeTrue();
		expect(await portIsReusable(proxyPort)).toBeTrue();
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

test("outer pre-readiness failure and peer startup failure retain diagnostics and cleanup", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-preready-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const upstreamPort = await availablePort();
	const proxyPort = await availablePort();
	try {
		const failed = await runOwnedPeerToExit({
			argv: [process.execPath, fixture],
			env: {
				...sanitizedEnvironment(root, vault),
				ARCHBOARD_TEST_ROOT: root,
				ARCHBOARD_TEST_UPSTREAM_PORT: String(upstreamPort),
				ARCHBOARD_TEST_PROXY_PORT: String(proxyPort),
				ARCHBOARD_TEST_REPO_ROOT: repoRoot,
				ARCHBOARD_TEST_FAIL_AFTER_LOCK: "1",
			},
		});
		expect(failed.code).not.toBe(0);
		expect(failed.stderr).toContain("forced failure after lock acquisition");
		expect(existsSync(lockFileFor(vault))).toBeFalse();
		expect(existsSync(root)).toBeFalse();
		expect(await portIsReusable(upstreamPort)).toBeTrue();
		expect(await portIsReusable(proxyPort)).toBeTrue();
		let startupFailure: unknown;
		try {
			await startOwnedPeer({
				argv: [process.execPath, join(root, "missing-peer.ts")],
				env: sanitizedEnvironment(root, vault),
				readySchema: ResourceReadySchema,
			});
		} catch (error) {
			startupFailure = error;
		}
		expect(startupFailure).toBeInstanceOf(Error);
		expect((startupFailure as Error).message).toMatch(
			/Peer died before readiness|Owned peer has no PID/,
		);
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

test("sanitized child environments remove both settle overrides", () => {
	const env = sanitizedEnvironment("/owned/root", "/owned/vault", {
		PATH: process.env.PATH,
		ARCHBOARD_SETTLE_MS: "1",
		ARCHBOARD_SETTLE_MAX_MS: "2",
	});
	expect(env.ARCHBOARD_SETTLE_MS).toBeUndefined();
	expect(env.ARCHBOARD_SETTLE_MAX_MS).toBeUndefined();
});
