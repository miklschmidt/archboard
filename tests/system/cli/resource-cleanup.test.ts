import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import { createInstallFixture } from "./support/install-fixture.ts";
import {
	createPackageCliOwner,
	checkoutRoot,
	packageFailure,
	type PackageRunResult,
} from "./support/package-cli.ts";
import { createRepositoryFixture } from "./support/repository-fixture.ts";

/**
 * An error's message as a reader sees it, without the colour a terminal adds.
 *
 * A shell that forces colour (`FORCE_COLOR`) colours both the matcher's own
 * failure messages and a child's stderr, and what is under test is the words.
 * @param error The error.
 * @returns Its message, with ANSI escapes taken out.
 */
function plain(error: unknown): string {
	return Bun.stripANSI((error as Error).message);
}

/**
 * The codes Bun gives a fetch that nothing listens for: its own name before
 * 1.4.3, the system code from 1.4.3 on.
 */
const CONNECTION_REFUSED_CODES = ["ConnectionRefused", "ECONNREFUSED"];

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
					return Response.json({ service: "archboard-server", status: "ok" });
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

		expect(intended).toBeInstanceOf(Error);
		const intendedError = intended as Error;
		expect(plain(intendedError)).toBe(
			'expect(received).toBe(expected)\n\nExpected: "intended assertion failure"\nReceived: "observed in flight"\n',
		);
		expect(runPromise).toBeDefined();
		if (!runPromise) {
			throw new Error("The in-flight package run was not retained.");
		}
		const result = await runPromise;
		expect(result.status !== null || result.signal !== null, packageFailure(result)).toBeTrue();
		for (const path of [outside, home, state, log, registry, vault]) {
			expect(path.length).toBeGreaterThan(0);
			expect(existsSync(path)).toBeFalse();
		}
		for (const url of [heldUrl, doubleUrl]) {
			expect(url.length).toBeGreaterThan(0);
			let listenerError: unknown;
			try {
				await fetch(`${url}/health`);
			} catch (error) {
				listenerError = error;
			}
			expect(listenerError).toBeInstanceOf(TypeError);
			const refusal = listenerError as Error & { code?: string; errno?: number; path?: string };
			expect(refusal.code).toBeOneOf(CONNECTION_REFUSED_CODES);
			expect(refusal.errno).toBe(0);
			expect(refusal.path).toBe(`${url}/health`);
		}
	});

	test("removes install and repository roots after assertion failures", () => {
		let installRoot = "";
		let repositoryRoot = "";
		let installFixture: ReturnType<typeof createInstallFixture> | undefined;
		let repositoryFixture: ReturnType<typeof createRepositoryFixture> | undefined;
		let installRegistered = false;
		let repositoryRegistered = false;
		let installError: unknown;
		let repositoryError: unknown;
		try {
			using fixture = createInstallFixture();
			installFixture = fixture;
			installRoot = fixture.root;
			installRegistered = true;
			expect("install fixture acquired").toBe("intended install assertion failure");
		} catch (error) {
			installError = error;
		}
		try {
			using fixture = createRepositoryFixture();
			repositoryFixture = fixture;
			repositoryRoot = fixture.root;
			repositoryRegistered = true;
			expect("repository fixture acquired").toBe("intended repository assertion failure");
		} catch (error) {
			repositoryError = error;
		}
		expect(installRegistered).toBeTrue();
		expect(repositoryRegistered).toBeTrue();
		if (!installFixture) {
			throw new Error("The registered install fixture was not retained.");
		}
		if (!repositoryFixture) {
			throw new Error("The registered repository fixture was not retained.");
		}
		expect(installRoot.length).toBeGreaterThan(0);
		expect(repositoryRoot.length).toBeGreaterThan(0);
		expect(installRoot).toBe(installFixture.root);
		expect(repositoryRoot).toBe(repositoryFixture.root);
		expect(installError).toBeInstanceOf(Error);
		expect(repositoryError).toBeInstanceOf(Error);
		expect(plain(installError)).toContain('Expected: "intended install assertion failure"');
		expect(plain(installError)).toContain('Received: "install fixture acquired"');
		expect(plain(repositoryError)).toContain('Expected: "intended repository assertion failure"');
		expect(plain(repositoryError)).toContain('Received: "repository fixture acquired"');
		expect(existsSync(installRoot)).toBeFalse();
		expect(existsSync(repositoryRoot)).toBeFalse();
	});

	test("removes a registered repository fixture when server startup rejects", async () => {
		let root = "";
		let missingServer = "";
		let retainedFixture: ReturnType<typeof createRepositoryFixture> | undefined;
		let fixtureRegistered = false;
		let startupError: unknown;
		try {
			await using resources = new AsyncDisposableStack();
			const fixture = resources.use(createRepositoryFixture());
			retainedFixture = fixture;
			root = fixture.root;
			missingServer = join(root, "missing-server.ts");
			fixtureRegistered = true;
			await startOwnedServer({
				serverPath: missingServer,
				vault: fixture.vault,
				env: fixture.serverEnvironment,
			});
		} catch (error) {
			startupError = error;
		}
		expect(fixtureRegistered).toBeTrue();
		if (!retainedFixture) {
			throw new Error("The registered repository fixture was not retained.");
		}
		expect(root.length).toBeGreaterThan(0);
		expect(root).toBe(retainedFixture.root);
		expect(missingServer).toBe(join(root, "missing-server.ts"));
		expect(startupError).toBeInstanceOf(Error);
		const startupMessage = plain(startupError);
		expect(startupMessage).toContain("died (exit 1).");
		expect(startupMessage).toContain(`error: Module not found "${missingServer}"`);
		expect(existsSync(root)).toBeFalse();
	});

	test("awaits a verified server after an assertion failure", async () => {
		let root = "";
		let vault = "";
		let registry = "";
		let base = "";
		let fixture: ReturnType<typeof createRepositoryFixture> | undefined;
		let server: OwnedServer | undefined;
		let fixtureRegistered = false;
		let serverDisposerRegistered = false;
		let verifiedRunning = false;
		let intended: unknown;
		try {
			await using resources = new AsyncDisposableStack();
			const acquiredFixture = resources.use(createRepositoryFixture());
			fixture = acquiredFixture;
			root = acquiredFixture.root;
			vault = acquiredFixture.vault;
			registry = acquiredFixture.registry;
			fixtureRegistered = true;
			server = await startOwnedServer({
				serverPath: join(checkoutRoot, "src/server.ts"),
				vault: acquiredFixture.vault,
				env: acquiredFixture.serverEnvironment,
			});
			resources.defer(() => server!.dispose());
			serverDisposerRegistered = true;
			base = server.base;
			await server.assertRunning();
			verifiedRunning = true;
			expect("running server").toBe("intended assertion failure");
		} catch (error) {
			intended = error;
		}
		expect(intended).toBeInstanceOf(Error);
		const intendedError = intended as Error;
		expect(plain(intendedError)).toBe(
			'expect(received).toBe(expected)\n\nExpected: "intended assertion failure"\nReceived: "running server"\n',
		);
		expect(verifiedRunning).toBeTrue();
		expect(fixtureRegistered).toBeTrue();
		expect(serverDisposerRegistered).toBeTrue();
		if (!fixture) {
			throw new Error("Verified server fixture was not retained.");
		}
		if (!server) {
			throw new Error("Verified server handle was not retained.");
		}
		expect(root.length).toBeGreaterThan(0);
		expect(vault.length).toBeGreaterThan(0);
		expect(registry.length).toBeGreaterThan(0);
		expect(base.length).toBeGreaterThan(0);
		expect(root).toBe(fixture.root);
		expect(vault).toBe(fixture.vault);
		expect(registry).toBe(fixture.registry);
		expect(base).toBe(server.base);
		expect(server.vault).toBe(vault);
		expect(existsSync(root)).toBeFalse();
		expect(existsSync(vault)).toBeFalse();
		expect(existsSync(registry)).toBeFalse();
		let listenerError: unknown;
		try {
			await fetch(`${base}/health`);
		} catch (error) {
			listenerError = error;
		}
		expect(listenerError).toBeInstanceOf(TypeError);
		const refusal = listenerError as Error & { code?: string; errno?: number; path?: string };
		expect(refusal.code).toBeOneOf(CONNECTION_REFUSED_CODES);
		expect(refusal.errno).toBe(0);
		expect(refusal.path).toBe(`${base}/health`);
		let childError: unknown;
		try {
			await server.assertRunning(intendedError);
		} catch (error) {
			childError = error;
		}
		expect(childError).toBeInstanceOf(Error);
		const death = childError as Error & { code?: string };
		expect(death.code).toBe("SERVER_PROCESS_DIED");
		expect(death.message).toBe(
			`Owned server pid unknown died (has no live generation).\nOwned server paths: ${JSON.stringify(server.paths)}`,
		);
		expect(death.cause).toBe(intendedError);
	}, 30_000);
});
