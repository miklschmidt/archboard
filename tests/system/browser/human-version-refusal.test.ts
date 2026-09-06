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

test(
	"a stale human write is refused with the version conflict and the pane reconciles to the note",
	async () => {
		await using resources = new AsyncDisposableStack();
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
