import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";

import {
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
import {
	installHoldRecorder,
	readHoldCounters,
	resetHoldRecorder,
} from "./support/human-hold-recorder.ts";
import { dragPageElement, EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";
import { PANE_TABS } from "./support/shell-dom.ts";
import {
	focusedBoardTitle,
	move,
	pageElement,
	pageElements,
	pageFileIds,
} from "./support/hold-page-scene.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = LIVE_SESSION_BOARD;
const RECOVERY_BOARD = "held-recovery-source";
const RECOVERY_SENTINEL_ID = "recovery-auth";
/** The header and pane-tab words that mark a board not saving or written elsewhere. */
const NOTE_MARKS = `[...document.querySelectorAll('header span, ${PANE_TABS} span')]
	.map(node => node.textContent.trim())
	.filter(text => /^(Not saving|Note written elsewhere|· not saving|· written elsewhere)/.test(text))`;
const RECOVERY_SEED = [
	{ id: RECOVERY_SENTINEL_ID, type: "rectangle", x: 100, y: 100, width: 220, height: 90 },
] as const;
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

interface FilesBody {
	files?: Record<string, { dataURL: string }>;
}

type Request = ReturnType<typeof createJsonRequester>;

interface BrowserFixture {
	browser: AgentBrowserSession;
	canvas: Awaited<ReturnType<typeof startOwnedCanvas>>;
	paneClient: string;
	request: Request;
}

let resources: AsyncDisposableStack;
let fixture: BrowserFixture;

beforeAll(async () => {
	resources = new AsyncDisposableStack();
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
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	// The supported desktop viewport; the canvas keeps its size for pointer targets.
	await browser.run(["set", "viewport", "1920", "1080"]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	const panes = await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(value) => value.paneCount === 1 && typeof value.panes[0]?.clientId === "string",
		"the real browser to register one pane",
	);
	fixture = { browser, canvas, paneClient: panes.panes[0]!.clientId, request };
	await installHoldRecorder(browser);
});

afterAll(async () => {
	await resources?.disposeAsync();
});

async function prepareBoard(
	board: string,
	seed: readonly Record<string, unknown>[],
	expectedElements: number,
	sentinelId: string,
): Promise<void> {
	const { browser, paneClient, request } = fixture;
	expect(
		(await request("/api/boards/new", { method: "POST", body: { board, level: "service" } }))
			.status,
	).toBe(200);
	const seeded = await request<ElementsBody>(`/api/elements/changes?board=${board}`, {
		method: "POST",
		body: { origin: "agent", upserts: seed },
	});
	expect(seeded.status).toBe(200);
	expect(seeded.body.elements).toHaveLength(expectedElements);
	const saved = await request<{ file: string }>("/api/boards/save", {
		method: "POST",
		body: { board },
	});
	expect(saved.status).toBe(200);
	expect(
		(
			await request("/api/boards/open", {
				method: "POST",
				body: { board, pane: paneClient, reload: true },
			})
		).status,
	).toBe(200);
	await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body.panes,
		(panes) => panes.some((pane) => pane.clientId === paneClient && pane.board === board),
		`pane ${paneClient} to adopt ${board}`,
	);
	await pollUntil(
		async () => ({
			boardTitle: await focusedBoardTitle(browser),
			sentinel: await pageElement(browser, sentinelId),
		}),
		(value) => value.boardTitle?.includes(board) === true && value.sentinel !== null,
		`the focused pane to render ${board} and its sentinel`,
	);
	await browser.run(["click", ".excalidraw"]);
	expect(await resetHoldRecorder(browser)).toBe(true);
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonical);
	}
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

async function documentsAgree(
	browser: AgentBrowserSession,
	request: Request,
	board: string,
): Promise<boolean> {
	const server = (await request<ElementsBody>(`/api/elements?board=${board}`)).body.elements;
	return documentSnapshot(server) === documentSnapshot(await pageElements(browser));
}

test(
	"human work stays visible through concurrent broadcasts",
	async () => {
		const { browser, paneClient, request } = fixture;
		await prepareBoard(BOARD, LIVE_SESSION_SEED, 8, "auth");
		expect(paneClient.length).toBeGreaterThan(0);

		// Keep the first hold promise pending after the server grants it. This leaves
		// the local drag unreported while another writer's broadcast reaches the pane.
		const authBefore = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === "auth")!;
		await browser.eval("window.__delayHumanHolds(1)");
		expect((await move(browser, "auth", 40, 40)).ok).toBe(true);
		await pollUntil(
			() => readHoldCounters(browser),
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
			() => documentsAgree(browser, request, BOARD),
			Boolean,
			"the mid-drag report to converge with the server broadcast",
		);
		const afterBoth = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements;
		expect(afterBoth.find((element) => element.id === "auth")!.x).toBeCloseTo(authBefore.x + 40, 3);
		expect(afterBoth.find((element) => element.id === "queue")!.backgroundColor).toBe("#ff8787");

		// A board saving normally carries no note warning in the header or its pane tab.
		const saving = await browser.eval<string[]>(NOTE_MARKS);
		expect(saving).toEqual([]);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);

test("save-elsewhere recovery releases the old holder and queues a trusted drag", async () => {
	const { browser, paneClient, request } = fixture;
	await prepareBoard(RECOVERY_BOARD, RECOVERY_SEED, 1, RECOVERY_SENTINEL_ID);
	const heldByPane = await request(`/api/boards/hold?board=${RECOVERY_BOARD}`, {
		method: "POST",
		body: { clientId: paneClient },
	});
	expect(heldByPane.status).toBe(200);
	const authBefore = (
		await request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`)
	).body.elements.find((element) => element.id === RECOVERY_SENTINEL_ID)!;
	const noteFile = (await request<{ file: string }>(`/api/boards/info?board=${RECOVERY_BOARD}`))
		.body.file;
	const foreign = {
		...expandElements([{ id: "theirs", type: "rectangle", x: 20, y: 20, width: 40, height: 40 }], {
			forStore: true,
		})[0]!,
		index: "Zz",
	};
	writeFileSync(
		noteFile,
		readFileSync(noteFile, "utf8").replace(
			`"id": "${RECOVERY_SENTINEL_ID}"`,
			`${JSON.stringify(foreign).slice(1, -1)}}, {"id": "${RECOVERY_SENTINEL_ID}"`,
		),
	);
	const conflict = await request(`/api/elements/changes?board=${RECOVERY_BOARD}`, {
		method: "POST",
		body: { clientId: paneClient, upserts: [authBefore] },
	});
	expect(conflict.status).toBe(409);
	// The hold raises its recovery dialog once; the person may decide later.
	await pollUntil(
		() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') !== null"),
		Boolean,
		"the board-stopped-saving dialog to open",
	);
	const stopped = await pollUntil(
		async () => ({
			held: (await request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`)).body.held,
			mark: (await browser.eval<string[]>(NOTE_MARKS)).join(" "),
		}),
		(value) => value.held?.board === RECOVERY_BOARD && /[Nn]ot saving/.test(value.mark),
		"the note hold and its rendered status",
	);
	expect(stopped.held?.board).toBe(RECOVERY_BOARD);

	const heldElementWrite = await request(
		`/api/elements/batch?board=${RECOVERY_BOARD}&clientId=${encodeURIComponent(paneClient)}`,
		{
			method: "POST",
			body: {
				elements: [
					{
						id: "held-image",
						type: "image",
						x: 120,
						y: 120,
						width: 40,
						height: 40,
						fileId: "held-file",
					},
				],
			},
		},
	);
	expect(heldElementWrite.status).toBe(200);
	const heldFileWrite = await request(
		`/api/files?board=${RECOVERY_BOARD}&clientId=${encodeURIComponent(paneClient)}`,
		{
			method: "POST",
			body: [
				{
					id: "held-file",
					dataURL: "data:image/png;base64,QUJPQVJESFVMRA==",
					mimeType: "image/png",
					created: 1,
				},
			],
		},
	);
	expect(heldFileWrite.status).toBe(200);
	await pollUntil(
		async () => ({
			element: await pageElement(browser, "held-image"),
			files: await pageFileIds(browser),
		}),
		(value) => value.element !== null && value.files.includes("held-file"),
		"the real pane to render the complete held copy",
	);

	const blockedBeforeSave = await request(`/api/boards/hold?board=${RECOVERY_BOARD}`, {
		method: "POST",
		body: { clientId: "another-writer" },
	});
	expect(blockedBeforeSave.status).toBe(409);
	const saved = await request<{ resolvedHold?: { outcome?: string } }>("/api/boards/save", {
		method: "POST",
		body: { board: RECOVERY_BOARD, name: "held-recovery-copy", clientId: paneClient },
	});
	expect(saved.status).toBe(200);
	expect(saved.body.resolvedHold?.outcome).toBe("elsewhere");
	expect(saved.body).not.toHaveProperty("panes");
	// The save-elsewhere resolved the hold, so the dialog raised for it closes on its own.
	await pollUntil(
		() => browser.eval<boolean>("document.querySelector('[role=\"alertdialog\"]') === null"),
		Boolean,
		"the resolved hold to close its recovery dialog",
	);
	const claimedAfterRecovery = await request(`/api/boards/hold?board=${RECOVERY_BOARD}`, {
		method: "POST",
		body: { clientId: "another-writer" },
	});
	expect(claimedAfterRecovery.status).toBe(200);
	let renewalWork: Promise<unknown> = Promise.resolve();
	const renewal = setInterval(() => {
		renewalWork = renewalWork.then(() =>
			request(`/api/boards/hold?board=${RECOVERY_BOARD}`, {
				method: "POST",
				body: { clientId: "another-writer" },
			}),
		);
	}, LOCK_RENEW_MS);
	resources.defer(() => clearInterval(renewal));
	await pollUntil(
		() => pageElement(browser, "theirs"),
		(value) => value !== null,
		"save-elsewhere to adopt the source note",
	);
	const [source, sourceFiles, target, targetFiles, panes, page, pageFiles] = await Promise.all([
		request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`),
		request<FilesBody>(`/api/files?board=${RECOVERY_BOARD}`),
		request<ElementsBody>("/api/elements?board=held-recovery-copy"),
		request<FilesBody>("/api/files?board=held-recovery-copy"),
		request<PaneList>("/api/panes"),
		pageElements(browser),
		pageFileIds(browser),
	]);
	expect(documentSnapshot(page)).toBe(documentSnapshot(source.body.elements));
	expect(pageFiles).toEqual(Object.keys(sourceFiles.body.files ?? {}).toSorted());
	expect(source.body.elements.map((element) => element.id)).toContain("theirs");
	expect(source.body.elements.map((element) => element.id)).not.toContain("held-image");
	expect(Object.keys(sourceFiles.body.files ?? {})).not.toContain("held-file");
	expect(target.body.elements.map((element) => element.id)).toContain("held-image");
	expect(Object.keys(targetFiles.body.files ?? {})).toContain("held-file");
	expect(
		panes.body.panes.some((pane) => pane.clientId === paneClient && pane.board === RECOVERY_BOARD),
	).toBe(true);
	expect(await focusedBoardTitle(browser)).toContain(RECOVERY_BOARD);
	expect(await browser.eval<string[]>(NOTE_MARKS)).toEqual([]);
	expect((await readHoldCounters(browser)).pending).toBe(0);

	const countsBefore = await readHoldCounters(browser);
	const beforeDelayed = (
		await request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`)
	).body.elements.find((element) => element.id === RECOVERY_SENTINEL_ID)!;
	await dragPageElement(browser, RECOVERY_SENTINEL_ID, 23, 0);
	const firstLoss = await pollUntil(
		() => readHoldCounters(browser),
		(value) => value.holdDone > countsBefore.holdDone,
		"the first human hold attempt to lose to the authoritative mutex",
	);
	const localDelayed = await pageElement(browser, RECOVERY_SENTINEL_ID);
	const serverDelayed = (
		await request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`)
	).body.elements.find((element) => element.id === RECOVERY_SENTINEL_ID)!;
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
	await renewalWork;
	const released = await request<{ released?: boolean }>(
		`/api/boards/hold/release?board=${RECOVERY_BOARD}`,
		{ method: "POST", body: { clientId: "another-writer" } },
	);
	expect(released.status).toBe(200);
	expect(released.body.released).toBe(true);
	await pollUntil(
		() => documentsAgree(browser, request, RECOVERY_BOARD),
		Boolean,
		"one later hold retry to persist the still-visible edit",
	);
	expect(
		(await request<ElementsBody>(`/api/elements?board=${RECOVERY_BOARD}`)).body.elements.find(
			(element) => element.id === RECOVERY_SENTINEL_ID,
		)!.x,
	).toBeCloseTo(beforeDelayed.x + 23, 3);
	const [finished, finalPanes] = await Promise.all([
		readHoldCounters(browser),
		request<PaneList>("/api/panes"),
	]);
	expect(finished.pending).toBe(0);
	expect(finished.reports).toBeGreaterThan(countsBefore.reports);
	expect(await browser.eval<string[]>(NOTE_MARKS)).toEqual([]);
	expect(
		finalPanes.body.panes.some(
			(pane) => pane.clientId === paneClient && pane.board === RECOVERY_BOARD,
		),
	).toBe(true);
}, 10_000);
