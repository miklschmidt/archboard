import { expect, test } from "bun:test";
import { join } from "node:path";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { switchTheme } from "./support/shell-dom.ts";
import {
	seedCanonicalModel,
	modelAddress,
	modelDrawn,
	editCanonicalModel,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";

// The canvas draws its pictures in the page (TASK-247): the model it read, laid
// out by engine workers in this browser, measured by this browser's canvas.
// What only a real page can show is that the whole of that happens here — no
// picture is asked of the server, the icons a picture names arrive, a picture
// this browser already drew is shown again without laying anything out, a
// theme switch recolours the picture on screen without drawing another, and a
// change to the model is drawn again. A copy of the build served under a
// sub-path, as a static host serves a project, draws there too.

/** Short on purpose: each wait names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 8_000 } as const;

/** The surface a pane's picture sits in. */
const SURFACE = "[data-slot='model-diagram']";

/**
 * Every resource this page has fetched, by URL.
 * @param browser The page.
 * @returns The URLs.
 */
const fetched = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval<string[]>(`performance.getEntriesByType("resource").map((entry) => entry.name)`);

/**
 * Every picture this browser keeps, as stored.
 * @param browser The page.
 * @returns The stored entries, by key.
 */
const keptPictures = (browser: AgentBrowserSession): Promise<Record<string, string>> =>
	browser.eval<Record<string, string>>(
		`new Promise((resolve) => {
			const opened = indexedDB.open("archboard-pictures");
			opened.onerror = () => resolve({});
			opened.onsuccess = () => {
				const db = opened.result;
				if (!db.objectStoreNames.contains("pictures")) return resolve({});
				const store = db.transaction("pictures").objectStore("pictures");
				const kept = {};
				const cursor = store.openCursor();
				cursor.onsuccess = () => {
					const at = cursor.result;
					if (at === null) return resolve(kept);
					kept[String(at.key)] = JSON.stringify(at.value);
					at.continue();
				};
				cursor.onerror = () => resolve(kept);
			};
		})`,
	);

/**
 * Wait for the picture to finish arriving before inspecting or retaining its SVG.
 * @param browser The page.
 * @param what What is being waited for.
 * @returns Settles once it has.
 */
const drawn = (browser: AgentBrowserSession, what: string): Promise<boolean> =>
	pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		(atRest) => atRest,
		what,
		WAIT,
	);

test("the page draws a model itself, keeps the picture, recolours it for a theme, and draws it again when the model changes", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = join(ownerRoot, "drawn-here-vault");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Pipeline");
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", modelAddress(server.base, model)]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser, "the model to be drawn in the page");
	await switchTheme(browser, "light");

	// Drawn here: the engine worker started, the icons were fetched by name, and
	// the server's render route was never asked.
	const first = await fetched(browser);
	expect(first.some((url) => url.includes("/api/architecture/render"))).toBeFalse();
	expect(first.some((url) => /\/assets\/layout-worker-[^/]+\.js$/.test(url))).toBeTrue();
	expect(first.some((url) => url.includes("/assets/diagram-icons/"))).toBeTrue();
	expect(
		await browser.eval<boolean>(
			`document.querySelector("${SURFACE} [data-type-icon] path") !== null`,
		),
	).toBeTrue();
	expect(Object.keys(await keptPictures(browser)).length).toBeGreaterThan(0);

	// Opened again: the kept picture is shown, and nothing is laid out for it, so
	// the kept entries are exactly as they were.
	const keptBefore = await keptPictures(browser);
	await browser.run(["open", modelAddress(server.base, model)]);
	await drawn(browser, "the kept picture to be shown after the page is opened again");
	expect(await browser.eval<string>(`document.querySelector("${SURFACE}").textContent`)).toContain(
		"Ingest",
	);
	expect(await keptPictures(browser)).toEqual(keptBefore);

	// Switching the theme recolours the picture on screen (TASK-346): the same
	// picture stays, takes the page's own colours for the other theme, and
	// nothing is laid out or kept for it.
	const ground = `getComputedStyle(document.querySelector("${SURFACE} svg > rect")).fill`;
	const lightGround = await browser.eval<string>(ground);
	await browser.eval(`window.shownPicture = document.querySelector("${SURFACE} svg")`);
	await switchTheme(browser, "dark");
	const darkGround = await pollUntil(
		() => browser.eval<string>(ground),
		(fill) => fill !== lightGround,
		"the picture on screen to take the dark theme's colours",
		WAIT,
	);
	expect(darkGround).toBe(
		await browser.eval<string>(`getComputedStyle(document.body).backgroundColor`),
	);
	expect(
		await browser.eval<boolean>(`document.querySelector("${SURFACE} svg") === window.shownPicture`),
	).toBeTrue();
	expect(await keptPictures(browser)).toEqual(keptBefore);

	// The model changes: the pane is told, and the new version is drawn here.
	await editCanonicalModel(request, vault, "draw-ledger", [
		{ type: "add-module", module: { name: "Ledger", kind: "datastore", order: 2 } },
	]);
	await pollUntil(
		() => browser.eval<string>(`document.querySelector("${SURFACE}")?.textContent ?? ""`),
		(text) => text.includes("Ledger"),
		"the model's new version to be drawn in the page",
		WAIT,
	);
	expect(
		(await fetched(browser)).some((url) => url.includes("/api/architecture/render")),
	).toBeFalse();
	// Laid out here and kept again, as a picture of the new version.
	const keptAfter = await pollUntil(
		() => keptPictures(browser),
		(kept) => Object.keys(kept).some((key) => !(key in keptBefore)),
		"the new version's picture to be kept",
		WAIT,
	);
	expect(keptAfter).not.toEqual(keptBefore);

	await server.assertRunning();
}, 40_000);

/** Where the host below serves the build, as a static host serves a project. */
const SUB_PATH = "/project/";

/**
 * Serve an Archboard server's page under a sub-path: a request under it reaches the server
 * without it, as a static host serves a build from its own directory. Every other request,
 * the API and the sockets among them, reaches the server unchanged. The server admits a page
 * of its own origin only, so the host names that origin when it passes a request on.
 * @param serverBase The server.
 * @returns The host's origin, and how to stop it.
 */
function serveUnderSubPath(serverBase: string): { base: string; stop: () => Promise<void> } {
	const target = new URL(serverBase);
	const forwarded = (url: URL): URL => {
		const path = url.pathname.startsWith(SUB_PATH)
			? url.pathname.slice(SUB_PATH.length - 1)
			: url.pathname;
		return new URL(`${path}${url.search}`, target);
	};
	const sameOrigin = (headers: Headers): Headers => {
		const next = new Headers(headers);
		next.delete("host");
		if (next.has("origin")) next.set("origin", target.origin);
		if (next.has("referer")) next.set("referer", `${target.origin}/`);
		return next;
	};
	/** One socket of the page, and the socket to the server it relays. Both speak JSON text. */
	interface Relay {
		readonly url: URL;
		upstream?: WebSocket;
		readonly waiting: string[];
	}
	const host = Bun.serve<Relay>({
		hostname: "127.0.0.1",
		port: 0,
		fetch: async (request, server) => {
			const url = forwarded(new URL(request.url));
			if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
				url.protocol = "ws:";
				return server.upgrade(request, { data: { url, waiting: [] } })
					? undefined
					: new Response("The socket did not open.", { status: 400 });
			}
			return fetch(url, {
				method: request.method,
				headers: sameOrigin(request.headers),
				body: request.body,
				redirect: "manual",
			});
		},
		websocket: {
			open(socket) {
				const relay = socket.data;
				// Sent with no Origin, which the server admits from a loopback Host.
				const upstream = new WebSocket(relay.url);
				relay.upstream = upstream;
				upstream.addEventListener("open", () => {
					for (const message of relay.waiting.splice(0)) upstream.send(message);
				});
				upstream.addEventListener("message", (event) => socket.send(event.data));
				upstream.addEventListener("close", () => socket.close());
			},
			message(socket, message) {
				const { upstream, waiting } = socket.data;
				const text = String(message);
				if (upstream?.readyState === WebSocket.OPEN) upstream.send(text);
				else waiting.push(text);
			},
			close(socket) {
				socket.data.upstream?.close();
			},
		},
	});
	return { base: `http://127.0.0.1:${host.port}`, stop: () => host.stop(true) };
}

test("a build served under a sub-path loads its assets there and draws a model", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = vaultIn(join(ownerRoot, "sub-path-vault"));
	const model = await seedCanonicalModel(vault, "Pipeline");
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const host = serveUnderSubPath(server.base);
	resources.defer(() => host.stop());
	registerServerBase(host.base);

	const browser = resources.use(await createAgentBrowser());
	const page = `${host.base}${SUB_PATH}`;
	await browser.run(["open", `${page}index.html?modelA=${model.manifest.id}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await drawn(browser, "the model to be drawn from the explicit index document");

	// The entry, the engine worker, the core and the icons all came from the build's own
	// directory, and nothing was asked of the root's assets.
	const urls = await fetched(browser);
	const assets = urls.filter((url) => new URL(url).pathname.includes("/assets/"));
	expect(assets.some((url) => /\/layout-worker-[^/]+\.js$/.test(url))).toBeTrue();
	expect(assets.some((url) => url.endsWith(".wasm"))).toBeTrue();
	expect(assets.some((url) => url.includes("/assets/diagram-icons/"))).toBeTrue();
	expect(assets.filter((url) => !url.startsWith(`${page}assets/`))).toEqual([]);
	expect(
		await browser.eval<boolean>(
			`document.querySelector("${SURFACE} [data-type-icon] path") !== null`,
		),
	).toBeTrue();
	// The router keeps the page where the host serves it while it writes the workspace.
	expect(new URL(await browser.eval<string>("location.href")).pathname).toBe(SUB_PATH);
	await browser.run(["open", `${page}?modelA=${model.manifest.id}`]);
	await drawn(browser, "the model to be drawn under the sub-path");

	await server.assertRunning();
}, 40_000);
