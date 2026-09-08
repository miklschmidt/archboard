// A person's edit is optimistic and the note decides (ADR 0022): a pane's
// change report states the note version it last saw, a report against a note
// that moved is refused with the same version conflict an agent gets, and the
// pane then shows the note, tells the person once, and states the new version.

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../support/timing.ts";
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
import { claimCounts, installClaimRecorder } from "./support/claim-interaction.ts";
import { noteVersionOf } from "../support/note-version.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";
import { shellNotices } from "./support/shell-dom.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = LIVE_SESSION_BOARD;
const WITHDRAWN_TITLE = "Your change was withdrawn";

interface ElementsBody {
	elements: ExcalidrawElement[];
}
interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

const pageElement = (browser: AgentBrowserSession, id: string): Promise<ExcalidrawElement | null> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		const element = app?.scene.getElementsIncludingDeleted()
			.find(candidate => candidate.id === ${JSON.stringify(id)});
		return element ? { ...element } : null;
	})()`);

/** The pane's live scene as id, position and colour, sorted by id. */
const pageShapes = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return app.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted)
			.map(element => [element.id, Math.round(element.x), Math.round(element.y), element.backgroundColor].join(":"))
			.sort();
	})()`);

/**
 * Move an element as a trusted pointer edit would: through Excalidraw's own
 * scene update with an immediate capture, which the pane reports as a person's.
 * @param browser The page.
 * @param id The element.
 * @param dx How far right.
 * @returns Whether the app was there to move it.
 */
const move = (browser: AgentBrowserSession, id: string, dx: number): Promise<{ ok?: boolean }> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		if (!app) return { error: "no Excalidraw app instance" };
		const elements = app.scene.getElementsIncludingDeleted().map(element =>
			element.id === ${JSON.stringify(id)} ? { ...element, x: element.x + ${dx} } : element);
		app.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
		return { ok: true };
	})()`);

/**
 * The `expectVersion` a change report stated, read off its URL.
 * @param url The report's URL, or null before any report.
 * @returns The version, or null when the URL states none.
 */
function statedVersion(url: string | null): number | null {
	const match = url === null ? null : /[?&]expectVersion=(\d+)/u.exec(url);
	return match ? Number(match[1]) : null;
}

/** A seeded board open in one real pane, with the claim recorder installed. */
interface SeededPane {
	readonly request: ReturnType<typeof createJsonRequester>;
	readonly browser: AgentBrowserSession;
	readonly paneClient: string;
	readonly versionAtOpen: number;
}

/**
 * Start a confined canvas, seed the board, save it and open it in a real pane.
 * @param resources Where the canvas and browser are disposed.
 * @returns The pane and its requester.
 */
async function seededPane(resources: AsyncDisposableStack): Promise<SeededPane> {
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "human-version-refusal-"));
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
		(
			await request("/api/boards/new", {
				method: "POST",
				body: { board: BOARD, level: "service" },
			})
		).status,
	).toBe(200);
	expect(
		(
			await request(`/api/elements/changes?board=${BOARD}`, {
				method: "POST",
				body: { origin: "agent", upserts: LIVE_SESSION_SEED },
			})
		).status,
	).toBe(200);
	const saved = await request<{ file: string }>("/api/boards/save", {
		method: "POST",
		body: { board: BOARD },
	});
	expect(saved.status).toBe(200);
	expect(typeof saved.body.file).toBe("string");
	const versionAtOpen = await noteVersionOf(request, BOARD);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
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
	await installClaimRecorder(browser);
	return { request, browser, paneClient, versionAtOpen };
}

/**
 * Hold the pane's next report back, drag `auth`, let an agent move the note
 * underneath, then release the report and wait for the refusal.
 * @param pane The seeded pane.
 * @returns The note version the agent's write produced and where `auth` was.
 */
async function refuseStaleDrag(
	pane: SeededPane,
): Promise<{ versionAfterAgent: number; authBefore: ExcalidrawElement }> {
	const { request, browser, paneClient, versionAtOpen } = pane;
	// Hold the pane's report back so the note can move underneath it.
	const authBefore = (
		await request<ElementsBody>(`/api/elements?board=${BOARD}`)
	).body.elements.find((element) => element.id === "auth")!;
	await browser.eval("window.__delayNextClaimReport()");
	expect((await move(browser, "auth", 40)).ok).toBe(true);
	const pendingReport = await pollUntil(
		() => claimCounts(browser),
		(value) => value.pending === 1,
		"the person's change report to be held back before the server sees it",
	);
	expect(statedVersion(pendingReport.lastReportUrl)).toBe(versionAtOpen);
	expect((await pageElement(browser, "auth"))!.x).toBeCloseTo(authBefore.x + 40, 3);

	// The pane's lease would exclude the agent; give it back server-side, as a
	// lease that lapsed would, then let an agent move the note.
	expect(
		(
			await request(`/api/boards/hold/release?board=${BOARD}`, {
				method: "POST",
				body: { clientId: paneClient },
			})
		).status,
	).toBe(200);
	const agentWrite = await request<{ fingerprint?: { version: number | null } }>(
		`/api/elements/changes?board=${BOARD}`,
		{
			method: "POST",
			body: {
				origin: "agent",
				upserts: [{ id: "queue", backgroundColor: "#ff8787" }],
			},
			doing: "recolouring the queue while a person drags",
		},
	);
	expect(agentWrite.status).toBe(200);
	const versionAfterAgent = await noteVersionOf(request, BOARD);
	expect(versionAfterAgent).toBeGreaterThan(versionAtOpen);

	// The held-back report now states a version the note has moved past.
	expect(
		(await browser.eval<{ released: boolean }>("window.__releaseClaimReport()")).released,
	).toBe(true);
	const refused = await pollUntil(
		() => claimCounts(browser),
		(value) => value.lastReportStatus !== null,
		"the stale change report to be answered",
	);
	expect(refused.lastReportStatus).toBe(409);
	return { versionAfterAgent, authBefore };
}

/** What the pane's text editor holds and which text elements the scene shows. */
const editorState = (
	browser: AgentBrowserSession,
): Promise<{ editing: string | null; typing: string | null; texts: string[] }> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return {
			editing: app.state.editingTextElement?.id ?? null,
			typing: document.querySelector('textarea.excalidraw-wysiwyg')?.value ?? null,
			texts: app.scene.getElementsIncludingDeleted()
				.filter(element => !element.isDeleted && element.type === "text")
				.map(element => element.text),
		};
	})()`);

test(
	"a stale human write is refused with the version conflict and the pane reconciles to the note",
	async () => {
		await using resources = new AsyncDisposableStack();
		const pane = await seededPane(resources);
		const { request, browser } = pane;
		const { versionAfterAgent, authBefore } = await refuseStaleDrag(pane);
		const refused = await claimCounts(browser);

		// The pane shows the note: the drag is withdrawn, the agent's colour is there.
		const serverShapes = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements
			.map((element) =>
				[element.id, Math.round(element.x), Math.round(element.y), element.backgroundColor].join(
					":",
				),
			)
			.toSorted();
		const reconciled = await pollUntil(
			() => pageShapes(browser),
			(shapes) => JSON.stringify(shapes) === JSON.stringify(serverShapes),
			"the pane to show exactly what the note holds",
		);
		expect(reconciled).toEqual(serverShapes);
		expect((await pageElement(browser, "auth"))!.x).toBeCloseTo(authBefore.x, 3);
		expect(await noteVersionOf(request, BOARD)).toBe(versionAfterAgent);
		const notices = await pollUntil(
			() => shellNotices(browser),
			(value) => value.some((notice) => notice.title === WITHDRAWN_TITLE),
			"the shell to say once that the change was withdrawn",
		);
		const withdrawn = notices.find((notice) => notice.title === WITHDRAWN_TITLE)!;
		expect(withdrawn.description).toContain("moved");
		expect(notices.filter((notice) => notice.title === WITHDRAWN_TITLE)).toHaveLength(1);

		// The next write states the version the refusal carried, and lands.
		expect((await move(browser, "auth", 25)).ok).toBe(true);
		const landed = await pollUntil(
			() => claimCounts(browser),
			(value) => value.sent === refused.sent + 1 && value.lastReportStatus === 200,
			"the person's next change to be written against the note's new version",
		);
		expect(statedVersion(landed.lastReportUrl)).toBe(versionAfterAgent);
		await pollUntil(
			async () =>
				(await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements.find(
					(element) => element.id === "auth",
				)!.x,
			(x) => Math.abs(x - (authBefore.x + 25)) < 0.001,
			"the note to hold the person's next change",
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);

test(
	"a version refusal drops a draft typed into text the note holds and shows the note's text",
	async () => {
		await using resources = new AsyncDisposableStack();
		const pane = await seededPane(resources);
		const { request, browser } = pane;

		// Open the seeded text for editing, as a double-click on it does, and
		// change it; the editor withholds the element from reports while open.
		await browser.eval(`(() => {
			const app = ${EXCALIDRAW_APP_EXPRESSION};
			const note = app.scene.getElementsIncludingDeleted().find(element => element.id === "note");
			app.startTextEditing({ sceneX: note.x + 5, sceneY: note.y + 5 });
			return true;
		})()`);
		await pollUntil(
			() => editorState(browser),
			(state) => state.editing === "note",
			"the seeded text's editor to open",
		);
		await browser.run(["keyboard", "type", "draft"]);
		await pollUntil(
			() => editorState(browser),
			(state) => state.typing === "draft",
			"the editor to hold the typed text",
		);

		const { versionAfterAgent } = await refuseStaleDrag(pane);

		// The editor closes without writing its draft into the restored element.
		const afterRefusal = await pollUntil(
			() => editorState(browser),
			(state) => state.editing === null && state.typing === null,
			"the refusal to close the text editor",
		);
		expect(afterRefusal.texts).toContain("drawn by the agent");
		expect(afterRefusal.texts.some((text) => text.includes("draft"))).toBe(false);

		const sentBefore = (await claimCounts(browser)).sent;
		expect((await move(browser, "auth", 25)).ok).toBe(true);
		await pollUntil(
			() => claimCounts(browser),
			(value) => value.sent > sentBefore && value.pending === 0 && value.lastReportStatus === 200,
			"the person's next change to be written against the note's new version",
		);
		expect(await noteVersionOf(request, BOARD)).toBeGreaterThan(versionAfterAgent);
		const noteTexts = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements
			.filter((element) => element.type === "text")
			.map((element) => (element as { text?: string }).text);
		expect(noteTexts).toContain("drawn by the agent");
		expect(noteTexts.some((text) => text?.includes("draft"))).toBe(false);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);

test(
	"a version refusal closes an open text editor and the typed text never reaches the note",
	async () => {
		await using resources = new AsyncDisposableStack();
		const pane = await seededPane(resources);
		const { request, browser } = pane;

		// Start typing a new text: the editor withholds its element from reports
		// while it is open, so the drag's report below carries everything else.
		await browser.run(["dblclick", ".excalidraw"]);
		await pollUntil(
			() => editorState(browser),
			(state) => state.editing !== null,
			"the text editor to open",
		);
		await browser.run(["keyboard", "type", "draft"]);
		await pollUntil(
			() => editorState(browser),
			(state) => state.typing === "draft",
			"the editor to hold the typed text",
		);

		const { versionAfterAgent } = await refuseStaleDrag(pane);

		// The note decides: the editor is closed with the refusal and the typed
		// text, which the note never held, is gone from the pane.
		const afterRefusal = await pollUntil(
			() => editorState(browser),
			(state) => state.editing === null && state.typing === null,
			"the refusal to close the text editor",
		);
		expect(afterRefusal.texts).not.toContain("draft");
		await pollUntil(
			() => shellNotices(browser),
			(value) => value.some((notice) => notice.title === WITHDRAWN_TITLE),
			"the shell to say that the change was withdrawn",
		);

		// Nothing brings it back: the next write lands against the new version
		// and the note holds no text the person typed into the withdrawn editor.
		// Closing the editor applies two server scenes. Let their render and
		// queued completion callbacks finish before injecting another scene edit.
		await browser.eval<boolean>(
			"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
		);
		await browser.run(["press", "Escape"]);
		const sentBefore = (await claimCounts(browser)).sent;
		expect((await move(browser, "auth", 25)).ok).toBe(true);
		await pollUntil(
			() => claimCounts(browser),
			(value) => value.sent > sentBefore && value.pending === 0 && value.lastReportStatus === 200,
			"the person's next change to be written against the note's new version",
		);
		expect(await noteVersionOf(request, BOARD)).toBeGreaterThan(versionAfterAgent);
		const noteTexts = (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements
			.filter((element) => element.type === "text")
			.map((element) => (element as { text?: string }).text);
		expect(noteTexts).not.toContain("draft");
		expect((await editorState(browser)).texts).not.toContain("draft");
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 4,
);
