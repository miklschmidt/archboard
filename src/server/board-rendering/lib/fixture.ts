import { existsSync, realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const buildRoot = resolve(repositoryRoot, "dist/frontend");
const assetsRoot = resolve(buildRoot, "assets");
const rendererEntry = resolve(buildRoot, "renderer.html");

const contentTypes = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".svg", "image/svg+xml"],
	[".woff2", "font/woff2"],
]);

export interface RendererFixture {
	readonly port: number;
	readonly url: string;
	listening(): boolean;
	close(): Promise<void>;
}

export interface RendererFixtureTestHooks {
	afterListen?(fixture: RendererFixture): Promise<void> | void;
}

function rendererFile(pathname: string, canonicalAssetsRoot: string): string | null {
	if (pathname === "/renderer.html") return rendererEntry;
	if (!pathname.startsWith("/assets/")) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (decoded.includes("%") || decoded.includes("\\") || encodeURI(decoded) !== pathname)
		return null;
	const relative = decoded.slice("/assets/".length);
	if (!relative || relative.split("/").some((segment) => segment === "." || segment === ".."))
		return null;
	const candidate = resolve(assetsRoot, relative);
	if (!candidate.startsWith(`${assetsRoot}${sep}`) || !existsSync(candidate)) return null;
	let canonical: string;
	try {
		canonical = realpathSync(candidate);
	} catch {
		return null;
	}
	return canonical.startsWith(`${canonicalAssetsRoot}${sep}`) && statSync(canonical).isFile()
		? canonical
		: null;
}

/** Serve only the built renderer entry and its built runtime assets. */
export async function createRendererFixture(
	testHooks: RendererFixtureTestHooks = {},
): Promise<RendererFixture> {
	if (!existsSync(rendererEntry) || !statSync(rendererEntry).isFile() || !existsSync(assetsRoot)) {
		throw new Error(
			`The built renderer entry is missing at ${rendererEntry}. Run \`bun run build:frontend\` before starting Archboard.`,
		);
	}
	const canonicalAssetsRoot = realpathSync(assetsRoot);
	if (!statSync(canonicalAssetsRoot).isDirectory())
		throw new Error(`The built renderer asset directory is missing at ${assetsRoot}.`);
	let server: ReturnType<typeof Bun.serve> | null = null;
	let fixture: RendererFixture | null = null;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			development: false,
			fetch(request) {
				const file = rendererFile(new URL(request.url).pathname, canonicalAssetsRoot);
				if (!file) return new Response("Not found", { status: 404 });
				return new Response(Bun.file(file), {
					headers: {
						"Content-Type": contentTypes.get(extname(file)) ?? "application/octet-stream",
					},
				});
			},
		});
		const ownedServer = server;
		const port = ownedServer.port;
		if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0)
			throw new Error("The renderer fixture did not receive a loopback port.");
		let closed = false;
		const createdFixture: RendererFixture = Object.freeze({
			port,
			url: `http://127.0.0.1:${port}/renderer.html`,
			listening: () => !closed,
			close: async () => {
				if (closed) return;
				await ownedServer.stop(true);
				closed = true;
			},
		});
		fixture = createdFixture;
		await testHooks.afterListen?.(createdFixture);
		return createdFixture;
	} catch (error) {
		if (fixture) await fixture.close();
		else if (server) await server.stop(true);
		throw error;
	}
}
