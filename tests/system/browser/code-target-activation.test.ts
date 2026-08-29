import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";

type Pane = { clientId: string; board: string; place: string };
type Panes = { paneCount: number; panes: Pane[] };
type LoggedRequest = { method: string; path: string; body: unknown };
type Capture = { pid: number; target: string; extra: string[] };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const fakeOpener = join(repoRoot, "tests/system/code-targets/fixtures/fake-opener.ts");
const repository = "github.com/acme/rendered";

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

async function installRequestLog(browser: AgentBrowserSession): Promise<void> {
	expect(
		await browser.eval<boolean>(`(() => {
			const original = window.fetch;
			window.__codeTargetRequests = [];
			window.fetch = function(input, init) {
				const url = new URL(typeof input === 'string' ? input : input.url, location.href);
				const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
				if (method === 'POST' && url.pathname === '/api/code-targets/open') {
					window.__codeTargetRequests.push({ method, path: url.pathname,
						body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
				}
				return original.apply(this, arguments);
			};
			return true;
		})()`),
	).toBe(true);
}

function requestLog(browser: AgentBrowserSession): Promise<LoggedRequest[]> {
	return browser.eval<LoggedRequest[]>("window.__codeTargetRequests ?? []");
}

async function elementPoint(
	browser: AgentBrowserSession,
	id: string,
): Promise<{ x: number; y: number }> {
	const point = await pollUntil(
		() =>
			browser.eval<{ x?: number; y?: number }>(`(() => {
			for (const node of document.querySelectorAll('.excalidraw')) {
				const key = Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
				let fiber = key ? node[key] : null;
				for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
					const app = fiber.stateNode;
					if (!app?.scene?.getElementsIncludingDeleted) continue;
					const element = app.scene.getElementsIncludingDeleted().find(candidate => candidate.id === ${JSON.stringify(id)});
					if (!element) break;
					const zoom = app.state.zoom?.value ?? 1;
					return { x: Math.round((element.x + element.width / 2 + app.state.scrollX) * zoom + app.state.offsetLeft),
						y: Math.round((element.y + element.height / 2 + app.state.scrollY) * zoom + app.state.offsetTop) };
				}
			}
			return {};
		})()`),
		(value): value is { x: number; y: number } =>
			Number.isFinite(value.x) && Number.isFinite(value.y),
		`the rendered element ${id}`,
		{ timeoutMs: 3_000 },
	);
	return { x: point.x!, y: point.y! };
}

async function activateLink(browser: AgentBrowserSession, id: string, href: string): Promise<void> {
	const point = await elementPoint(browser, id);
	await browser.run(["mouse", "move", String(point.x), String(point.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`Boolean(document.querySelector(${JSON.stringify(`a[href="${href}"]`)}))`,
			),
		Boolean,
		`the rendered link ${href}`,
		{ timeoutMs: 3_000 },
	);
	await browser.run(["click", `a[href="${href}"]`]);
}

async function dragElement(browser: AgentBrowserSession, id: string, dx: number): Promise<void> {
	const point = await elementPoint(browser, id);
	await browser.run(["mouse", "move", String(point.x), String(point.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "move", String(point.x + dx), String(point.y)]);
	await browser.run(["mouse", "up"]);
}

async function activatePopup(
	browser: AgentBrowserSession,
	id: string,
	href: string,
	canvasBase: string,
): Promise<void> {
	await activateLink(browser, id, href);
	const tabs = await browser.run(["tab", "list"]);
	expect(tabs).toContain(` - ${href}`);
	const canvasTab = tabs.match(/\[(t\d+)\].*127\.0\.0\.1/)?.[1];
	expect(canvasTab).toBeDefined();
	await browser.run(["tab", "close"]);
	await browser.run(["tab", canvasTab!]);
	expect(await browser.run(["get", "url"])).toContain(canvasBase);
}

function openerSelection(capture: string, exits: string, marker: string) {
	return {
		version: 1,
		kind: "custom",
		executable: process.execPath,
		argv: [fakeOpener, "immediate", capture, marker, exits, "{path}"],
	} as const;
}

async function captures(directory: string, exits: string, count: number): Promise<Capture[]> {
	return pollUntil(
		() =>
			readdirSync(directory)
				.filter((file) => file.endsWith(".json"))
				.toSorted()
				.map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as Capture),
		(value) =>
			value.length >= count && value.every(({ pid }) => readdirSync(exits).includes(`${pid}.json`)),
		`${count} controlled opener captures`,
	);
}

async function changeOpenerCaptureThroughSettings(
	browser: AgentBrowserSession,
	capture: string,
	marker: string,
	exits: string,
): Promise<void> {
	await browser.run(["click", 'button[aria-label="Opener settings"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				"Boolean(document.querySelector('.opener-argument input[aria-label=\"Argument 5\"]'))",
			),
		Boolean,
		"the rendered custom opener settings",
	);
	for (const [argument, value] of [
		[3, capture],
		[4, marker],
		[5, exits],
	] as const)
		await browser.run(["fill", `.opener-argument input[aria-label="Argument ${argument}"]`, value]);
	await browser.run(["click", ".modal-footer .btn-primary"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				"Boolean(document.querySelector('dialog[aria-label=\"Opener settings\"]'))",
			),
		(value) => !value,
		"the saved opener settings dialog to close",
	);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				"Boolean(document.querySelector('button[aria-label=\"Dismiss notice\"]'))",
			),
		Boolean,
		"the opener settings save notice",
	);
	await browser.run(["click", 'button[aria-label="Dismiss notice"]']);
}

test(
	"bound file and directory targets activate in two mounted panes with fresh settings",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = join(ownerRoot, "vault");
		const checkout = join(ownerRoot, "checkout");
		const state = join(ownerRoot, "state");
		const registry = join(state, "repos.json");
		const config = join(state, "opener.json");
		const firstCaptures = join(ownerRoot, "captures-first");
		const firstExits = join(ownerRoot, "exits-first");
		const secondCaptures = join(ownerRoot, "captures-second");
		const secondExits = join(ownerRoot, "exits-second");
		const firstMarker = join(ownerRoot, "release-first");
		const secondMarker = join(ownerRoot, "release-second");
		const humanFileHref = "file:///human-rendered.ts";
		for (const directory of [
			vault,
			join(checkout, "src", "directory"),
			state,
			firstCaptures,
			firstExits,
			secondCaptures,
			secondExits,
		])
			mkdirSync(directory, { recursive: true });
		writeFileSync(join(checkout, "src", "index.ts"), "export {};\n");
		git(checkout, "init", "-q");
		git(checkout, "remote", "add", "origin", `https://${repository}.git`);
		writeFileSync(
			registry,
			JSON.stringify([
				{ repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
			]),
		);
		writeFileSync(config, JSON.stringify(openerSelection(firstCaptures, firstExits, firstMarker)));

		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: canvasTestEnvironment({
				ARCHBOARD_REPOS: registry,
				ARCHBOARD_OPENER_CONFIG: config,
				LOG_FILE_PATH: join(ownerRoot, "canvas.log"),
			}),
		});
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const api = createJsonRequester(canvas);
		for (const [board, id, path] of [
			["file-board", "file-target", "src/index.ts"],
			["directory-board", "directory-target", "src/directory"],
		] as const) {
			expect((await api("/api/boards/new", { method: "POST", body: { board } })).status).toBe(200);
			expect(
				(
					await api(`/api/elements?board=${board}`, {
						method: "POST",
						body: {
							id,
							type: "rectangle",
							x: 100,
							y: 100,
							width: 240,
							height: 120,
							backgroundColor: "#e3f2fd",
							customData: { archboard: { binding: { repo: repository, path } } },
						},
					})
				).status,
			).toBe(200);
		}
		expect(
			(
				await api("/api/elements?board=file-board", {
					method: "POST",
					body: {
						id: "remote-target",
						type: "rectangle",
						x: 100,
						y: 280,
						width: 240,
						height: 120,
						backgroundColor: "#fce4ec",
						customData: {
							archboard: {
								binding: {
									repo: "github.com/acme/remote",
									path: "src/a b.ts",
									branch: "feature/links",
								},
							},
						},
					},
				})
			).status,
		).toBe(200);
		expect(
			(
				await api("/api/elements?board=directory-board", {
					method: "POST",
					body: {
						id: "human-file-target",
						type: "rectangle",
						x: 380,
						y: 280,
						width: 180,
						height: 100,
						backgroundColor: "#fff3e0",
						link: humanFileHref,
					},
				})
			).status,
		).toBe(200);
		expect(
			(
				await api("/api/elements?board=directory-board", {
					method: "POST",
					body: {
						id: "remote-directory",
						type: "rectangle",
						x: 100,
						y: 280,
						width: 240,
						height: 120,
						backgroundColor: "#fce4ec",
						customData: {
							archboard: {
								binding: {
									repo: "github.com/acme/remote",
									path: "docs",
									commit: "abc123",
								},
							},
						},
					},
				})
			).status,
		).toBe(200);

		const browser = resources.use(await createAgentBrowser());
		await browser.run(["open", canvas.base]);
		expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
		let panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 1,
			"the first pane",
		);
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "file-board", pane: panes.panes[0]!.clientId, reload: true },
		});
		expect((await api("/api/panes/open", { method: "POST" })).status).toBe(200);
		panes = await pollUntil(
			() => api<Panes>("/api/panes").then((response) => response.body),
			(value) => value.paneCount === 2,
			"two rendered panes",
		);
		const right = panes.panes.find((pane) => pane.place === "right")!;
		await api("/api/boards/open", {
			method: "POST",
			body: { board: "directory-board", pane: right.clientId, reload: true },
		});
		await installRequestLog(browser);

		const fileHref = "/api/code-targets/open?board=file-board&element=file-target";
		const directoryHref = "/api/code-targets/open?board=directory-board&element=directory-target";
		await activateLink(browser, "file-target", fileHref);
		await activateLink(browser, "directory-target", directoryHref);
		const first = await captures(firstCaptures, firstExits, 2);
		expect(first.map((capture) => capture.target).toSorted()).toEqual(
			[join(checkout, "src", "directory"), join(checkout, "src", "index.ts")].toSorted(),
		);
		expect(await requestLog(browser)).toEqual([
			{
				method: "POST",
				path: "/api/code-targets/open",
				body: { board: "file-board", element: "file-target" },
			},
			{
				method: "POST",
				path: "/api/code-targets/open",
				body: { board: "directory-board", element: "directory-target" },
			},
		]);

		await changeOpenerCaptureThroughSettings(browser, secondCaptures, secondMarker, secondExits);
		await activateLink(browser, "file-target", fileHref);
		await activateLink(browser, "directory-target", directoryHref);
		const second = await captures(secondCaptures, secondExits, 2);
		expect(second.map((capture) => capture.target).toSorted()).toEqual(
			first.map((capture) => capture.target).toSorted(),
		);
		await dragElement(browser, "file-target", 36);
		await pollUntil(
			() =>
				api<{ elements: Array<{ id: string; x: number }> }>("/api/elements?board=file-board").then(
					(response) => response.body.elements.find((element) => element.id === "file-target")?.x,
				),
			(value) => typeof value === "number" && value > 120,
			"the human drag to persist",
		);
		const remoteHref = "https://github.com/acme/remote/tree/feature%2Flinks/src/a%20b.ts";
		await activatePopup(browser, "remote-target", remoteHref, canvas.base);
		await dragElement(browser, "remote-target", 28);
		await pollUntil(
			() =>
				api<{ elements: Array<{ id: string; x: number }> }>("/api/elements?board=file-board").then(
					(response) => response.body.elements.find((element) => element.id === "remote-target")?.x,
				),
			(value) => typeof value === "number" && value > 115,
			"the GitHub-presented human drag to persist",
		);
		const afterRemoteDrag = readFileSync(join(vault, "file-board.excalidraw.md"), "utf8");
		expect(afterRemoteDrag).toContain('"repo": "github.com/acme/remote"');
		expect(afterRemoteDrag).not.toContain(remoteHref);
		await activatePopup(
			browser,
			"remote-directory",
			"https://github.com/acme/remote/tree/abc123/docs",
			canvas.base,
		);
		const humanHref = "https://example.com/human?x=1";
		expect(
			(
				await api("/api/elements?board=file-board", {
					method: "POST",
					body: {
						id: "human-target",
						type: "rectangle",
						x: 100,
						y: 280,
						width: 240,
						height: 120,
						backgroundColor: "#fff3e0",
						link: humanHref,
					},
				})
			).status,
		).toBe(200);
		await activatePopup(browser, "human-target", humanHref, canvas.base);
		expect(await requestLog(browser)).toHaveLength(4);
		const rawNotes = ["file-board", "directory-board"].map((board) =>
			readFileSync(join(vault, `${board}.excalidraw.md`), "utf8"),
		);
		const derivedCandidates = [
			"/api/code-targets/open?board=file-board&element=file-target",
			"/api/code-targets/open?board=file-board&element=remote-target",
			"/api/code-targets/open?board=directory-board&element=directory-target",
			"/api/code-targets/open?board=directory-board&element=remote-directory",
			"https://github.com/acme/rendered/tree/HEAD/src/index.ts",
			"https://github.com/acme/rendered/tree/HEAD/src/directory",
			"https://github.com/acme/remote/tree/feature%2Flinks/src/a%20b.ts",
			"https://github.com/acme/remote/tree/abc123/docs",
			pathToFileURL(join(checkout, "src", "index.ts")).href,
			pathToFileURL(join(checkout, "src", "directory")).href,
		];
		const machineValues = [
			checkout,
			registry,
			config,
			process.execPath,
			fakeOpener,
			"immediate",
			firstCaptures,
			firstExits,
			firstMarker,
			secondCaptures,
			secondExits,
			secondMarker,
			"{path}",
		];
		for (const raw of rawNotes)
			for (const privateValue of [...derivedCandidates, ...machineValues])
				expect(raw).not.toContain(privateValue);
		expect(rawNotes[0]).toContain(`"repo": "${repository}"`);
		expect(rawNotes[0]).toContain('"path": "src/index.ts"');
		expect(rawNotes[1]).toContain('"path": "src/directory"');
		expect(rawNotes[0]).toContain(humanHref);
		expect(rawNotes[1]).toContain(humanFileHref);
		expect(await browser.eval<boolean>("Boolean(document.querySelector('.excalidraw'))")).toBe(
			true,
		);
		await canvas.assertRunning();
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
