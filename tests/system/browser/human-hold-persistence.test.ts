import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";

import {
	LOCK_FREE_LINGER_MS,
	LOCK_RENEW_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { LIVE_SESSION_BOARD, LIVE_SESSION_SEED } from "./fixtures/live-session-scene.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = LIVE_SESSION_BOARD;
const IGNORED_FIELDS = new Set([
	"version",
	"versionNonce",
	"updated",
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
]);

interface ElementsBody {
	elements: ExcalidrawElement[];
	held?: { board?: string; fromScreen?: boolean };
}

interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

interface HoldCounters {
	holdDone: number;
	holds: number;
	pending: number;
	reports: number;
}

type Request = ReturnType<typeof createJsonRequester>;

async function openSeededBoard(resources: AsyncDisposableStack): Promise<{
	browser: AgentBrowserSession;
	canvas: Awaited<ReturnType<typeof startOwnedCanvas>>;
	paneClient: string;
	request: Request;
}> {
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "human-hold-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: join(root, "vault"),
		env: canvasTestEnvironment({ LOG_FILE_PATH: join(root, "canvas.log") }),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	expect(
		(await request("/api/boards/new", { method: "POST", body: { board: BOARD, level: "service" } }))
			.status,
	).toBe(200);
	const seeded = await request<ElementsBody>(`/api/elements/changes?board=${BOARD}`, {
		method: "POST",
		body: { origin: "agent", upserts: LIVE_SESSION_SEED },
	});
	expect(seeded.status).toBe(200);
	expect(seeded.body.elements).toHaveLength(8);
	const saved = await request<{ file: string }>("/api/boards/save", {
		method: "POST",
		body: { board: BOARD },
	});
	expect(saved.status).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	const panes = await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(value) => value.paneCount === 1 && typeof value.panes[0]?.clientId === "string",
		"the real browser to register one pane",
	);
	const paneClient = panes.panes[0]!.clientId;
	expect(
		(
			await request("/api/boards/open", {
				method: "POST",
				body: { board: BOARD, pane: paneClient, reload: true },
			})
		).status,
	).toBe(200);
	await pollUntil(
		() => pageElement(browser, "auth"),
		(value) => value !== null,
		"the pane to render the seeded board",
	);
	await browser.run(["click", ".excalidraw"]);
	return { browser, canvas, paneClient, request };
}

const installHoldRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__holdPersistence = { delay: 0, pending: [], holds: 0, holdDone: 0, reports: 0 };
		window.__delayHumanHolds = count => { window.__holdPersistence.delay = count; };
		window.__releaseHumanHold = () => {
			const entry = window.__holdPersistence.pending.shift();
			if (!entry) return { released: false };
			entry.release();
			return { released: true };
		};
		const original = window.fetch;
		window.fetch = function(input, init) {
			const url = typeof input === "string" ? input : input?.url ?? "";
			const method = init?.method ?? input?.method ?? "GET";
			const hold = method === "POST" && url.includes("/api/boards/hold")
				&& !url.includes("/api/boards/hold/release");
			const report = method === "POST" && url.includes("/api/elements/changes");
			if (hold) window.__holdPersistence.holds += 1;
			if (report) window.__holdPersistence.reports += 1;
			const answer = original.apply(this, arguments);
			if (!hold) return answer;
			const counted = answer.then(response => {
				window.__holdPersistence.holdDone += 1;
				return response;
			});
			if (window.__holdPersistence.delay === 0) return counted;
			window.__holdPersistence.delay -= 1;
			return new Promise((resolve, reject) => {
				window.__holdPersistence.pending.push({ release: () => counted.then(resolve, reject) });
			});
		};
		return { installed: true };
	})()`);

const counters = (browser: AgentBrowserSession): Promise<HoldCounters> =>
	browser.eval(`(() => ({
		holdDone: window.__holdPersistence.holdDone,
		holds: window.__holdPersistence.holds,
		pending: window.__holdPersistence.pending.length,
		reports: window.__holdPersistence.reports,
	}))()`);

const move = (
	browser: AgentBrowserSession,
	id: string,
	dx: number,
	dy: number,
): Promise<{ ok?: boolean; error?: string }> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		if (!app) return { error: "no Excalidraw app instance" };
		const elements = app.scene.getElementsIncludingDeleted().map(element =>
			element.id === ${JSON.stringify(id)}
				? { ...element, x: element.x + ${dx}, y: element.y + ${dy} }
				: element);
		app.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
		return { ok: true };
	})()`);

const pageElement = (browser: AgentBrowserSession, id: string): Promise<ExcalidrawElement | null> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		const element = app?.scene.getElementsIncludingDeleted()
			.find(candidate => candidate.id === ${JSON.stringify(id)});
		return element ? { ...element } : null;
	})()`);

const pageElements = (browser: AgentBrowserSession): Promise<ExcalidrawElement[]> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return app ? app.scene.getElementsIncludingDeleted().map(element => ({ ...element })) : [];
	})()`);

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.filter((key) => !IGNORED_FIELDS.has(key))
				.toSorted()
				.map((key) => [key, canonical(record[key])]),
		);
	}
	return value;
}

const documentSnapshot = (elements: ExcalidrawElement[]): string =>
	JSON.stringify(
		elements
			.filter((element) => !element.isDeleted)
			.toSorted((left, right) => left.id.localeCompare(right.id))
			.map(canonical),
	);

async function documentsAgree(browser: AgentBrowserSession, request: Request): Promise<boolean> {
	const server = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements;
	return documentSnapshot(server) === documentSnapshot(await pageElements(browser));
}

test(
	"human work stays visible through broadcasts, note conflicts, and mutex retries",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { browser, paneClient, request } = await openSeededBoard(resources);
		await installHoldRecorder(browser);
		expect(paneClient.length).toBeGreaterThan(0);

		// Keep the first hold promise pending after the server grants it. This leaves
		// the local drag unreported while another writer's broadcast reaches the pane.
		const authBefore = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth")!;
		await browser.eval("window.__delayHumanHolds(1)");
		expect((await move(browser, "auth", 40, 40)).ok).toBe(true);
		await pollUntil(
			() => counters(browser),
			(value) => value.pending === 1,
			"the human hold to remain pending before its report",
		);
		const released = await request<{ released: boolean }>(
			`/api/boards/hold/release?board=${BOARD}`,
			{
				method: "POST",
				body: { clientId: paneClient },
			},
		);
		expect(released.body.released).toBe(true);
		expect(
			(
				await request(`/api/elements/changes?board=${BOARD}`, {
					method: "POST",
					body: { origin: "agent", upserts: [{ id: "queue", backgroundColor: "#ff8787" }] },
				})
			).status,
		).toBe(200);
		const localAuth = await pageElement(browser, "auth");
		const serverAuth = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth")!;
		expect(localAuth!.x).toBeCloseTo(authBefore.x + 40, 3);
		expect(serverAuth.x).toBeCloseTo(authBefore.x, 3);
		const planted =
			Math.abs(serverAuth.x - localAuth!.x) < 0.001
				? []
				: [`auth (rectangle) .x: server ${serverAuth.x} / pane ${localAuth!.x}`];
		expect(planted.some((line) => line.startsWith("auth (rectangle) .x:"))).toBe(true);
		expect(
			(await browser.eval<{ released: boolean }>("window.__releaseHumanHold()")).released,
		).toBe(true);
		await pollUntil(
			() => documentsAgree(browser, request),
			Boolean,
			"the mid-drag report to converge with the server broadcast",
		);
		const afterBoth = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements;
		expect(afterBoth.find((element) => element.id === "auth")!.x).toBeCloseTo(authBefore.x + 40, 3);
		expect(afterBoth.find((element) => element.id === "queue")!.backgroundColor).toBe("#ff8787");

		const saving = await browser.eval<{
			elsewhere: string | null;
			metas: Array<string | null>;
		}>(`(() => ({
			metas: [...document.querySelectorAll(".bar-identity .meta")].map(node => node.textContent),
			elsewhere: document.querySelector(".chip-elsewhere")?.textContent ?? null,
		}))()`);
		expect(saving.elsewhere).toBeNull();
		expect(saving.metas).toContain("in the vault");
		expect(saving.metas.some((text) => /unsaved/.test(text ?? ""))).toBe(false);

		const noteFile = (await request<{ file: string }>(`/api/boards/info?board=${BOARD}`)).body.file;
		const foreign = expandElements(
			[{ id: "theirs", type: "rectangle", x: 20, y: 20, width: 40, height: 40 }],
			{ forStore: true },
		)[0]!;
		writeFileSync(
			noteFile,
			readFileSync(noteFile, "utf8").replace(
				'"id": "auth"',
				`${JSON.stringify(foreign).slice(1, -1)}}, {"id": "auth"`,
			),
		);
		const noticed = await pollUntil(
			() =>
				browser.eval<{ dialog: string | null; elsewhere: string | null }>(`(() => ({
					dialog: document.querySelector(".modal-title")?.textContent ?? null,
					elsewhere: document.querySelector(".chip-elsewhere")?.textContent ?? null,
				}))()`),
			(value) => /note changed on disk/.test(value.elsewhere ?? ""),
			"the pre-write note-change notification to appear",
		);
		expect(noticed.elsewhere).toMatch(/note changed on disk/);
		expect(noticed.dialog).toBeNull();
		expect((await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.held).toBeUndefined();

		expect((await move(browser, "queue", 9, 9)).ok).toBe(true);
		const stopped = await pollUntil(
			async () => (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.held,
			(value) => value?.board === BOARD && value.fromScreen === true,
			"the changed note to stop this board saving",
		);
		expect(stopped?.board).toBe(BOARD);
		expect(stopped?.fromScreen).toBe(true);
		const heldChrome = await browser.eval<{ dialog: string | null; mark: string | null }>(
			`(() => ({
				dialog: document.querySelector(".modal-title")?.textContent ?? null,
				mark: document.querySelector(".chip-held")?.textContent ?? null,
			}))()`,
		);
		expect(heldChrome.dialog).toBeNull();
		expect(heldChrome.mark).toMatch(/not saving/);
		expect(await documentsAgree(browser, request)).toBe(true);
		expect(
			(await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements.some(
				(element) => element.id === "theirs",
			),
		).toBe(false);

		await browser.run(["click", ".chip-held"]);
		const offered = await pollUntil(
			() =>
				browser.eval<{ choices: string[]; title: string | null }>(`(() => ({
					title: document.querySelector(".modal-title")?.textContent ?? null,
					choices: [...document.querySelectorAll(".choices .btn")]
						.map(button => button.textContent ?? ""),
				}))()`),
			(value) => value.choices.length === 3,
			"the held-board recovery choices to appear",
		);
		expect(offered.title).toMatch(/not being saved/);
		expect(offered.choices).toEqual(["Save as…", "Reload the note", "Overwrite the note"]);
		const overwrite = await browser.eval<{ clicked: boolean }>(`(() => {
			const button = [...document.querySelectorAll(".choices .btn")]
				.find(candidate => candidate.textContent === "Overwrite the note");
			button?.click();
			return { clicked: Boolean(button) };
		})()`);
		expect(overwrite.clicked).toBe(true);
		const recovered = await pollUntil(
			async () => ({
				bytes: readFileSync(noteFile, "utf8"),
				mark: await browser.eval<string | null>(
					'document.querySelector(".chip-held")?.textContent ?? null',
				),
			}),
			(value) =>
				!value.bytes.includes('"theirs"') && value.bytes.includes('"queue"') && value.mark === null,
			"overwrite to restore saving with the pane's held board",
		);
		expect(recovered.bytes).not.toContain('"theirs"');
		expect(recovered.bytes).toContain('"queue"');
		expect(recovered.mark).toBeNull();

		expect(
			await browser.eval<boolean>(`(() => {
			const app = ${EXCALIDRAW_APP_EXPRESSION};
			return app?.state.viewModeEnabled === true;
		})()`),
		).toBe(false);
		expect(
			(
				await request(`/api/boards/hold?board=${BOARD}`, {
					method: "POST",
					body: { clientId: "another-writer" },
				})
			).status,
		).toBe(200);
		const renewal = setInterval(() => {
			void request(`/api/boards/hold?board=${BOARD}`, {
				method: "POST",
				body: { clientId: "another-writer" },
			});
		}, LOCK_RENEW_MS);
		resources.defer(() => clearInterval(renewal));
		const countsBefore = await counters(browser);
		const beforeDelayed = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth")!;
		expect((await move(browser, "auth", 23, 0)).ok).toBe(true);
		const firstLoss = await pollUntil(
			() => counters(browser),
			(value) => value.holdDone > countsBefore.holdDone,
			"the first human hold attempt to lose to the authoritative mutex",
		);
		const localDelayed = await pageElement(browser, "auth");
		const serverDelayed = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth")!;
		expect(firstLoss.holds - countsBefore.holds).toBe(1);
		expect(localDelayed!.x).toBeCloseTo(beforeDelayed.x + 23, 3);
		expect(serverDelayed.x).toBeCloseTo(beforeDelayed.x, 3);
		expect(
			await browser.eval<boolean>(`(() => {
			const app = ${EXCALIDRAW_APP_EXPRESSION};
			return app?.state.viewModeEnabled === true;
		})()`),
		).toBe(false);

		clearInterval(renewal);
		expect(
			(
				await request(`/api/boards/hold/release?board=${BOARD}`, {
					method: "POST",
					body: { clientId: "another-writer" },
				})
			).status,
		).toBe(200);
		await pollUntil(
			() => documentsAgree(browser, request),
			Boolean,
			"one later hold retry to persist the still-visible edit",
		);
		expect(
			(await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements.find(
				(element) => element.id === "auth",
			)!.x,
		).toBeCloseTo(beforeDelayed.x + 23, 3);
		await pollUntil(
			() =>
				browser.eval<boolean>(`(() => {
					const app = ${EXCALIDRAW_APP_EXPRESSION};
					return app?.state.viewModeEnabled === true;
				})()`),
			(value) => !value,
			"the pane to remain editable after the other writer releases",
			{ timeoutMs: LOCK_FREE_LINGER_MS + TEST_BROWSER_COMMAND_TIMEOUT_MS },
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 8,
);
