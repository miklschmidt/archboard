import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { LOCK_LEASE_MS } from "../../../src/shared/timing/timing.ts";
import {
	RawLockReadySchema,
	ResourceReadySchema,
	registerResourceSet,
} from "./fixtures/process-resource-owner.ts";
import { runOwnedPeerToExit, startOwnedPeer } from "./support/owned-peer-process.ts";
import { availablePort, portIsReusable, sanitizedEnvironment } from "./support/process-http.ts";
import { plantStaticProbes } from "./support/static-probes.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/process-resource-owner.ts");
const lockFileFor = (vault: string) => join(vault, ".archboard/locks/resource-cleanup.lock");

test("direct assertion cleanup reaps every registered resource", async () => {
	await using resources = new AsyncDisposableStack();
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
	await using resources = new AsyncDisposableStack();
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
	await using resources = new AsyncDisposableStack();
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
	await using resources = new AsyncDisposableStack();
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

test("every dynamic owner establishes lexical disposal before its first acquisition", () => {
	for (const name of [
		"local-bind",
		"board-lock-api",
		"cross-process-lock",
		"element-ops-one-write",
		"apply-one-write",
		"promotion-delete-bridge-one-write",
		"import-replace-one-write",
		"import-merge-held-one-write",
		"snapshot-one-write",
	]) {
		const source = readFileSync(join(import.meta.dir, `${name}.test.ts`), "utf8");
		for (const match of source.matchAll(/mkdtempSync\(/g)) {
			const root = match.index;
			const owner = source.lastIndexOf("test(", root);
			const disposal = source.indexOf("await using resources = new AsyncDisposableStack()", owner);
			expect(disposal, `${name} has no lexical disposal before root at ${root}`).toBeGreaterThan(
				owner,
			);
			expect(disposal, `${name} starts disposal after root at ${root}`).toBeLessThan(root);
		}
	}
});

test("static probes roll back earlier exclusive creates after a later collision", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-static-probe-failure-"));
	try {
		const probes = plantStaticProbes(root);
		probes.restore();
		expect(existsSync(join(root, "dist/frontend"))).toBeFalse();
		expect(existsSync(join(root, "dist"))).toBeFalse();
		const first = join(root, "dist/frontend/task-130-09-frontend-probe.js");
		const collision = join(root, "dist/task-130-09-stale-probe.js");
		let failure: unknown;
		try {
			plantStaticProbes(root, {
				beforeCreate(path, index) {
					if (index === 1) writeFileSync(path, "foreign bytes", { flag: "wx" });
				},
			});
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(Error);
		expect(existsSync(first)).toBeFalse();
		expect(existsSync(join(root, "dist/frontend"))).toBeFalse();
		expect(readFileSync(collision, "utf8")).toBe("foreign bytes");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("TERM-resistant peer is killed through its handle and its lease is recoverable", async () => {
	await using resources = new AsyncDisposableStack();
	let root = "";
	let port = 0;
	try {
		root = mkdtempSync(join(tmpdir(), "archboard-process-cleanup-stubborn-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		port = await availablePort();
		const env = sanitizedEnvironment(root, vault);
		const stubborn = await startOwnedPeer({
			argv: [process.execPath, fixture],
			env: {
				...env,
				ARCHBOARD_TEST_RESOURCE_MODE: "lock",
				ARCHBOARD_TEST_REPO_ROOT: repoRoot,
				ARCHBOARD_TEST_LOCK_BOARD: "stubborn-resource",
				ARCHBOARD_TEST_LOCK_HOLDER: "stubborn-owner",
				ARCHBOARD_TEST_IGNORE_TERM: "1",
				ARCHBOARD_TEST_STUBBORN_PORT: String(port),
			},
			readySchema: RawLockReadySchema,
		});
		resources.defer(() => stubborn.dispose());
		expect(stubborn.ready.port).toBe(port);
		expect(existsSync(stubborn.ready.lockFile)).toBeTrue();
		const started = Date.now();
		await stubborn.dispose();
		expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
		expect(Date.now() - started).toBeLessThan(4_000);
		expect(await stubborn.exit).toEqual({ code: null, signal: "SIGKILL" });
		expect(await portIsReusable(port)).toBeTrue();
		await Bun.sleep(LOCK_LEASE_MS + 100);

		const recovery = await startOwnedPeer({
			argv: [process.execPath, fixture],
			env: {
				...env,
				ARCHBOARD_TEST_RESOURCE_MODE: "lock",
				ARCHBOARD_TEST_REPO_ROOT: repoRoot,
				ARCHBOARD_TEST_LOCK_BOARD: "stubborn-resource",
				ARCHBOARD_TEST_LOCK_HOLDER: "recovery-owner",
			},
			readySchema: RawLockReadySchema,
		});
		resources.defer(() => recovery.dispose());
		expect(recovery.ready.process).not.toBe(stubborn.ready.process);
		await recovery.dispose();
		expect(existsSync(recovery.ready.lockFile)).toBeFalse();
	} finally {
		await resources.disposeAsync();
	}
	expect(existsSync(root)).toBeFalse();
	expect(await portIsReusable(port)).toBeTrue();
}, 20_000);
