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

/** The canonical paths of the built renderer the fixture is allowed to serve. */
interface RendererBuild {
	readonly rendererEntry: string;
	readonly assetsRoot: string;
}

class RendererFixtureError extends Error {
	readonly code = "RENDERER_FIXTURE_INVALID_BUILD" as const;

	/**
	 * Names a renderer build the fixture refuses to serve.
	 * @param message Why the build is refused and how to rebuild it.
	 * @param options The underlying cause, when a file-system call produced it.
	 */
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RendererFixtureError";
	}
}

/**
 * Resolves a build path to its canonical form and checks it is the expected kind of entry.
 * @param target The path from the build root.
 * @param description What the path is, for the refusal message.
 * @param kind Whether a regular file or a directory is expected.
 * @returns The canonical path.
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
 * Tells whether a path lies strictly inside a root directory.
 * @param root The containing directory.
 * @param target The path to test.
 * @returns True when the target is below the root.
 */
function isBelow(root: string, target: string): boolean {
	return target.startsWith(`${root}${sep}`);
}

/**
 * Decodes the asset path an assets request names.
 * @param pathname The request path.
 * @returns The path relative to the assets root, or null when the request is not a decodable asset path.
 */
function assetRelativePath(pathname: string): string | null {
	if (!pathname.startsWith("/assets/")) {
		return null;
	}
	try {
		return decodeURIComponent(pathname).slice("/assets/".length);
	} catch {
		return null;
	}
}

/**
 * Resolves a candidate through symlinks and keeps it only as a regular file below the root.
 * @param root The canonical assets root.
 * @param candidate The resolved candidate path.
 * @returns The canonical file path, or null when it escapes the root or is not a file.
 */
function canonicalFileBelow(root: string, candidate: string): string | null {
	let canonical: string;
	try {
		canonical = realpathSync(candidate);
	} catch {
		return null;
	}
	return isBelow(root, canonical) && statSync(canonical).isFile() ? canonical : null;
}

/**
 * Maps a request path to the one built file it may serve.
 * @param pathname The request path.
 * @param build The canonical renderer build.
 * @returns The canonical file to serve, or null for anything outside the build.
 */
function rendererFile(pathname: string, build: RendererBuild): string | null {
	if (pathname === "/renderer.html") {
		return build.rendererEntry;
	}
	const relative = assetRelativePath(pathname);
	if (relative === null) {
		return null;
	}
	const candidate = resolve(build.assetsRoot, relative);
	if (!isBelow(build.assetsRoot, candidate)) {
		return null;
	}
	return canonicalFileBelow(build.assetsRoot, candidate);
}

/**
 * Locates the built renderer and refuses a build whose entry or assets escape it via symlinks.
 * @param buildRoot The frontend build directory.
 * @returns The canonical entry and assets paths.
 */
function locateRendererBuild(buildRoot: string): RendererBuild {
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
	return { rendererEntry: canonicalRendererEntry, assetsRoot: canonicalAssetsRoot };
}

/**
 * Answers one fixture request with the built file it names, or 404.
 * @param request The incoming request.
 * @param build The canonical renderer build.
 * @returns The file response.
 */
function serveRendererFile(request: Request, build: RendererBuild): Response {
	const file = rendererFile(new URL(request.url).pathname, build);
	if (!file) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(Bun.file(file), {
		headers: {
			"Content-Type": contentTypes.get(extname(file)) ?? "application/octet-stream",
		},
	});
}

/**
 * Reads the loopback port a started server bound.
 * @param server The listening server.
 * @returns The bound port.
 */
function boundPort(server: ReturnType<typeof Bun.serve>): number {
	const port = server.port;
	if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0) {
		throw new Error("The renderer fixture did not receive a loopback port.");
	}
	return port;
}

/**
 * Wraps a listening server as the fixture handle the owner holds.
 * @param server The listening server.
 * @returns The fixture handle.
 */
function fixtureFor(server: ReturnType<typeof Bun.serve>): RendererFixture {
	const port = boundPort(server);
	let closed = false;
	return Object.freeze({
		port,
		url: `http://127.0.0.1:${port}/renderer.html`,
		/**
		 * Tells whether the fixture still listens.
		 * @returns True until close has completed.
		 */
		listening: () => !closed,
		/** Stops the server once; later calls are no-ops. */
		close: async () => {
			if (closed) {
				return;
			}
			await server.stop(true);
			closed = true;
		},
	});
}

/**
 * Serve only the built renderer entry and its built runtime assets.
 * @param testHooks Build-root override and post-listen hook used by the owner test.
 * @returns The listening fixture.
 */
async function createRendererFixture(
	testHooks: RendererFixtureTestHooks = {},
): Promise<RendererFixture> {
	const build = locateRendererBuild(resolve(testHooks.buildRoot ?? defaultBuildRoot));
	let server: ReturnType<typeof Bun.serve> | null = null;
	let fixture: RendererFixture | null = null;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			development: false,
			/**
			 * Serves the one built file a request names.
			 * @param request The incoming request.
			 * @returns The file response, or 404.
			 */
			fetch: (request) => serveRendererFile(request, build),
		});
		const createdFixture = fixtureFor(server);
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
