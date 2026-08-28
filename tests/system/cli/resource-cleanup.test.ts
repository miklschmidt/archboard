import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import { createInstallFixture } from "./support/install-fixture.ts";
import {
	createPackageCliOwner,
	checkoutRoot,
	packageFailure,
	type PackageRunResult,
} from "./support/package-cli.ts";
import { createRepositoryFixture } from "./support/repository-fixture.ts";

describe("CLI resource cleanup", () => {
	test("awaits an in-flight shipped-bin child before owned listeners and roots disappear", async () => {
		let releaseHealth!: () => void;
		let observeHealth!: () => void;
		const healthReleased = new Promise<void>((resolve) => (releaseHealth = resolve));
		const healthObserved = new Promise<void>((resolve) => (observeHealth = resolve));
		let runPromise: Promise<PackageRunResult> | undefined;
		let outside = "";
		let home = "";
		let state = "";
		let log = "";
		let registry = "";
		let vault = "";
		let heldUrl = "";
		let doubleUrl = "";
		let intended: unknown;

		try {
			await using stack = new AsyncDisposableStack();
			const held = Bun.serve({
				hostname: "127.0.0.1",
				port: 0,
				async fetch(request) {
					if (new URL(request.url).pathname === "/health") {
						observeHealth();
						await healthReleased;
					}
					return Response.json({ service: "mcp-excalidraw-canvas", status: "ok" });
				},
			});
			heldUrl = held.url.origin;
			stack.defer(async () => {
				releaseHealth();
				await held.stop(true);
			});
			const http = stack.use(createCliHttpDouble());
			doubleUrl = http.url;
			const owner = stack.use(createPackageCliOwner());
			({ outside, home, state, log, registry, vault } = owner);
			runPromise = owner.run(["status"], { url: heldUrl });
			await healthObserved;
			expect("observed in flight").toBe("intended assertion failure");
		} catch (error) {
			intended = error;
		}

		expect(intended).toBeDefined();
		const result = await runPromise!;
		expect(result.status !== null || result.signal !== null, packageFailure(result)).toBeTrue();
		for (const path of [outside, home, state, log, registry, vault])
			expect(existsSync(path)).toBeFalse();
		for (const url of [heldUrl, doubleUrl]) {
			let unreachable = false;
			try {
				await fetch(`${url}/health`);
			} catch {
				unreachable = true;
			}
			expect(unreachable).toBeTrue();
		}
	});

	test("removes install and repository roots after assertion failures", () => {
		let installRoot = "";
		let repositoryRoot = "";
		try {
			using fixture = createInstallFixture();
			installRoot = fixture.root;
			expect(join(installRoot, "missing")).toBe(installRoot);
		} catch {}
		try {
			using fixture = createRepositoryFixture();
			repositoryRoot = fixture.root;
			expect(join(repositoryRoot, "missing")).toBe(repositoryRoot);
		} catch {}
		expect(existsSync(installRoot)).toBeFalse();
		expect(existsSync(repositoryRoot)).toBeFalse();
	});

	test("removes a registered repository fixture when canvas startup rejects", async () => {
		let root = "";
		let startupError: unknown;
		try {
			await using resources = new AsyncDisposableStack();
			const fixture = resources.use(createRepositoryFixture());
			root = fixture.root;
			await startOwnedCanvas({
				serverPath: join(fixture.root, "missing-server.ts"),
				vault: fixture.vault,
				env: fixture.serverEnvironment,
			});
		} catch (error) {
			startupError = error;
		}
		expect(startupError).toBeDefined();
		expect(existsSync(root)).toBeFalse();
	});

	test("awaits a verified canvas after an assertion failure", async () => {
		let root = "";
		let base = "";
		let canvas: OwnedCanvas | undefined;
		let intended: unknown;
		try {
			await using resources = new AsyncDisposableStack();
			const fixture = resources.use(createRepositoryFixture());
			root = fixture.root;
			canvas = await startOwnedCanvas({
				serverPath: join(checkoutRoot, "src/server.ts"),
				vault: fixture.vault,
				env: fixture.serverEnvironment,
			});
			resources.defer(() => canvas!.dispose());
			base = canvas.base;
			await canvas.assertRunning();
			expect("running canvas").toBe("intended assertion failure");
		} catch (error) {
			intended = error;
		}
		expect(intended).toBeDefined();
		expect(existsSync(root)).toBeFalse();
		let listenerStopped = false;
		try {
			await fetch(`${base}/health`);
		} catch {
			listenerStopped = true;
		}
		expect(listenerStopped).toBeTrue();
		let childStopped = false;
		try {
			await canvas!.assertRunning();
		} catch {
			childStopped = true;
		}
		expect(childStopped).toBeTrue();
	}, 30_000);
});
