import { realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const defaultBuildRoot = resolve(repositoryRoot, "dist/frontend");

const contentTypes = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".woff2", "font/woff2"],
]);

interface RendererFixture {
	readonly port: number;
	readonly url: string;
	listening(): boolean;
	close(): Promise<void>;
}

interface RendererFixtureTestHooks {
	buildRoot?: string;
	afterListen?(fixture: RendererFixture): Promise<void> | void;
}

class RendererFixtureError extends Error {
	readonly code = "RENDERER_FIXTURE_INVALID_BUILD" as const;

	/**
	 *
	 */
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RendererFixtureError";
	}
}

/**
 *
 */
function canonicalTarget(target: string, description: string, kind: "file" | "directory"): string {
	let canonical: string;
	try {
		canonical = realpathSync(target);
	} catch (cause) {
		throw new RendererFixtureError(
			`The built renderer ${description} is missing at ${target}. Run \`bun run build:frontend\` before starting Archboard.`,
			{ cause },
		);
	}
	const stats = statSync(canonical);
	if (kind === "file" ? !stats.isFile() : !stats.isDirectory()) {
		throw new RendererFixtureError(
			`The built renderer ${description} at ${target} is not a regular ${kind}. Rebuild it with \`bun run build:frontend\`.`,
		);
	}
	return canonical;
}

/**
 *
 */
function isBelow(root: string, target: string): boolean {
	return target.startsWith(`${root}${sep}`);
}

/**
 *
 */
function rendererFile(
	pathname: string,
	canonicalRendererEntry: string,
	canonicalAssetsRoot: string,
): string | null {
	if (pathname === "/renderer.html") {
		return canonicalRendererEntry;
	}
	if (!pathname.startsWith("/assets/")) {
		return null;
	}
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	const relative = decoded.slice("/assets/".length);
	const candidate = resolve(canonicalAssetsRoot, relative);
	if (!isBelow(canonicalAssetsRoot, candidate)) {
		return null;
	}
	let canonical: string;
	try {
		canonical = realpathSync(candidate);
	} catch {
		return null;
	}
	return isBelow(canonicalAssetsRoot, canonical) && statSync(canonical).isFile() ? canonical : null;
}

/** Serve only the built renderer entry and its built runtime assets. */
async function createRendererFixture(
	testHooks: RendererFixtureTestHooks = {},
): Promise<RendererFixture> {
	const buildRoot = resolve(testHooks.buildRoot ?? defaultBuildRoot);
	const rendererEntry = resolve(buildRoot, "renderer.html");
	const assetsRoot = resolve(buildRoot, "assets");
	const canonicalBuildRoot = canonicalTarget(buildRoot, "frontend directory", "directory");
	const canonicalRendererEntry = canonicalTarget(rendererEntry, "entry", "file");
	const canonicalAssetsRoot = canonicalTarget(assetsRoot, "asset directory", "directory");
	if (!isBelow(canonicalBuildRoot, canonicalRendererEntry)) {
		throw new RendererFixtureError(
			`The built renderer entry at ${rendererEntry} resolves outside the canonical frontend build ${canonicalBuildRoot}. Rebuild it without an escaping symlink.`,
		);
	}
	if (!isBelow(canonicalBuildRoot, canonicalAssetsRoot)) {
		throw new RendererFixtureError(
			`The built renderer asset directory at ${assetsRoot} resolves outside the canonical frontend build ${canonicalBuildRoot}. Rebuild it without an escaping symlink.`,
		);
	}
	let server: ReturnType<typeof Bun.serve> | null = null;
	let fixture: RendererFixture | null = null;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			development: false,
			/**
			 *
			 */
			fetch(request) {
				const file = rendererFile(
					new URL(request.url).pathname,
					canonicalRendererEntry,
					canonicalAssetsRoot,
				);
				if (!file) {
					return new Response("Not found", { status: 404 });
				}
				return new Response(Bun.file(file), {
					headers: {
						"Content-Type": contentTypes.get(extname(file)) ?? "application/octet-stream",
					},
				});
			},
		});
		const ownedServer = server;
		const port = ownedServer.port;
		if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0) {
			throw new Error("The renderer fixture did not receive a loopback port.");
		}
		let closed = false;
		const createdFixture: RendererFixture = Object.freeze({
			port,
			url: `http://127.0.0.1:${port}/renderer.html`,
			/**
			 *
			 */
			listening: () => !closed,
			/**
			 *
			 */
			close: async () => {
				if (closed) {
					return;
				}
				await ownedServer.stop(true);
				closed = true;
			},
		});
		fixture = createdFixture;
		await testHooks.afterListen?.(createdFixture);
		return createdFixture;
	} catch (error) {
		if (fixture) {
			await fixture.close();
		} else if (server) {
			await server.stop(true);
		}
		throw error;
	}
}

export {
	type RendererFixture,
	type RendererFixtureTestHooks,
	RendererFixtureError,
	createRendererFixture,
};
