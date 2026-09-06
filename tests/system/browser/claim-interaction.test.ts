import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
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
	claimCounts,
	expectNoteUnchanged,
	installClaimRecorder,
	verifyBoardStatusPresentation,
	verifyPaneScopedTakeBack,
} from "./support/claim-interaction.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./support/page-scene.ts";
import { paneSection } from "./support/shell-dom.ts";
import {
	WORKBENCH_SNAPSHOT_EXPRESSION,
	type WorkbenchSnapshot,
} from "./support/workbench-metrics.ts";
const repoRoot = resolve(import.meta.dir, "../../..");
const BOARD = LIVE_SESSION_BOARD;
/** WCAG 2.5.8 target size floor. */
const MIN_TARGET = 24;
interface ElementsBody {
	elements: ExcalidrawElement[];
}
interface PaneList {
	paneCount: number;
	panes: Array<{
		board: string;
		clientId: string;
		viewport: { x: number; y: number; width: number; height: number; zoom: number };
	}>;
}
const paneViewport = (report: PaneList, clientId: string) =>
	report.panes.find((pane) => pane.clientId === clientId)?.viewport;
interface WriteBody {
	code?: string;
	element?: ExcalidrawElement;
	elements?: ExcalidrawElement[];
	error?: string;
}
interface ClaimBody {
	claim: { holder: { id?: string; kind?: string; reason?: string; claimed?: boolean } };
}
interface ClaimBanner extends WorkbenchSnapshot {
	view: boolean | null;
}
type Request = ReturnType<typeof createJsonRequester>;
async function openSeededBoard(resources: AsyncDisposableStack): Promise<{
	browser: AgentBrowserSession;
	canvas: Awaited<ReturnType<typeof startOwnedCanvas>>;
	clientId: string;
	noteFile: string;
	request: Request;
}> {
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "claim-interaction-"));
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
	expect(typeof saved.body.file).toBe("string");
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	const panes = await pollUntil(
		async () => (await request<PaneList>("/api/panes")).body,
		(value) => value.paneCount === 1 && typeof value.panes[0]?.clientId === "string",
		"the real browser to register one pane",
	);
	expect(
		(
			await request("/api/boards/open", {
				method: "POST",
				body: { board: BOARD, pane: panes.panes[0]!.clientId, reload: true },
			})
		).status,
	).toBe(200);
	await pollUntil(
		() => pageElement(browser, "auth"),
		(value) => value !== null,
		"the pane to render the seeded board",
	);
	await browser.run(["click", ".excalidraw"]);
	return {
		browser,
		canvas,
		clientId: panes.panes[0]!.clientId,
		noteFile: saved.body.file,
		request,
	};
}
const readBanner = (browser: AgentBrowserSession): Promise<ClaimBanner> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return {
			...${WORKBENCH_SNAPSHOT_EXPRESSION},
			view: app ? app.state.viewModeEnabled === true : null,
		};
	})()`);
const pageElement = (browser: AgentBrowserSession, id: string): Promise<ExcalidrawElement | null> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		const element = app?.scene.getElementsIncludingDeleted()
			.find(candidate => candidate.id === ${JSON.stringify(id)});
			return element ? { ...element } : null;
		})()`);
test(
	"claims remain readable and camera-safe while content and take-back revoke them",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { browser, canvas, clientId, noteFile, request } = await openSeededBoard(resources);
		await installClaimRecorder(browser);
		const initial = await readBanner(browser);
		expect(initial).toMatchObject({
			pane: "Pane A",
			connection: "Connected",
			headerClaim: null,
			banner: null,
			takeBackState: null,
		});
		const claimWhy = "redrawing the payment path";
		const claim = await request<ClaimBody>(`/api/boards/claim?board=${BOARD}`, {
			method: "POST",
			body: { reason: claimWhy },
		});
		expect(claim.status).toBe(200);
		expect(claim.body.claim.holder.kind).toBe("agent");
		expect(claim.body.claim.holder.reason).toBe(claimWhy);
		expect(claim.body.claim.holder.claimed).toBe(true);
		const claimed = await pollUntil(
			() => readBanner(browser),
			(value) => value.reason === claimWhy && value.banner !== null,
			"the claimed-board explanation to become readable",
		);
		expect(claimed.headerClaim).toBe("Board claimed");
		expect(claimed.banner?.text).toContain("Agent claimed this board");
		expect(claimed.banner?.reason).toBe(claimWhy);
		expect(claimed.view).toBe(false);
		expect(claimed.take).toBe("Take back control");
		expect(claimed.takeBackState).toBe("idle");
		expect(claimed.takeBackHeight).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(claimed.banner?.height).toBeLessThan(90);
		const beforeCamera = await claimCounts(browser);
		const cameraBefore = paneViewport((await request<PaneList>("/api/panes")).body, clientId);
		expect(cameraBefore).toBeDefined();
		expect(
			await browser.eval<boolean>(`(() => {
				const app = ${EXCALIDRAW_APP_EXPRESSION};
				const zoom = app.state.zoom?.value ?? 1;
				app.updateScene({
					appState: {
						scrollX: app.state.scrollX + 35,
						scrollY: app.state.scrollY - 20,
						zoom: { value: zoom * 1.04 },
					},
					captureUpdate: "NEVER",
				});
				return true;
			})()`),
		).toBe(true);
		const cameraAfter = await pollUntil(
			async () => paneViewport((await request<PaneList>("/api/panes")).body, clientId),
			(viewport) => viewport !== undefined && viewport.zoom !== cameraBefore?.zoom,
			"the camera-only change to reach the pane registry",
		);
		expect(cameraAfter?.zoom).toBeGreaterThan(cameraBefore?.zoom ?? 0);
		const afterCamera = await claimCounts(browser);
		expect(afterCamera.holds - beforeCamera.holds).toBe(0);
		expect(afterCamera.sent - beforeCamera.sent).toBe(0);
		const step = "moving the queue out of the payment path";
		const claimedWrite = await request<WriteBody>(`/api/elements?board=${BOARD}`, {
			method: "POST",
			doing: step,
			body: { type: "rectangle", x: 820, y: 60, width: 60, height: 40 },
		});
		expect(claimedWrite.status).toBe(200);
		const streamedId = claimedWrite.body.elements?.[0]?.id ?? claimedWrite.body.element?.id;
		if (!streamedId) {
			throw new Error("The claimed agent write returned no element identity");
		}
		await pollUntil(
			() => pageElement(browser, streamedId),
			(element) => element?.x === 820 && element.y === 60,
			"the claimed agent write to appear on the live canvas without moving the camera",
		);
		expect(paneViewport((await request<PaneList>("/api/panes")).body, clientId)).toEqual(
			cameraAfter,
		);
		const narrated = await pollUntil(
			() => readBanner(browser),
			(value) => value.doing === step,
			"the latest per-write narration to reach the workbench dock",
		);
		expect(narrated.history.at(-1)).toContain(step);
		expect(narrated.reason).toBe(claimWhy);
		expect(narrated.headerClaim).toBe("Board claimed");
		expect((await request("/api/panes/open", { method: "POST", body: {} })).status).toBe(200);
		const split = await pollUntil(
			async () => (await request<PaneList>("/api/panes")).body,
			(report) => report.paneCount === 2,
			"a second pane to mount for focused workbench transfer",
		);
		const secondClientId = split.panes.find((pane) => pane.clientId !== clientId)?.clientId;
		expect(typeof secondClientId).toBe("string");
		expect(
			(
				await request("/api/boards/new", {
					method: "POST",
					body: { board: "workbench-other", level: "service" },
				})
			).status,
		).toBe(200);
		expect(
			(
				await request("/api/boards/open", {
					method: "POST",
					body: { board: "workbench-other", pane: secondClientId },
				})
			).status,
		).toBe(200);
		await browser.run(["click", `${paneSection("Pane B")} .excalidraw`]);
		const paneB = await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane B",
			"the header and dock to follow Pane B focus",
		);
		expect(paneB).toMatchObject({ headerClaim: null, banner: null, takeBackState: null });
		expect(paneB.otherBanners).toEqual(["Pane A"]);
		await browser.run(["click", `${paneSection("Pane A")} .excalidraw`]);
		const paneA = await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane A" && value.doing === step,
			"the header and dock to restore Pane A claim and progress",
		);
		expect(paneA).toMatchObject({ headerClaim: "Board claimed", reason: claimWhy });
		await browser.run(["click", `${paneSection("Pane B")} .excalidraw`]);
		expect(
			(await request("/api/panes/close", { method: "POST", body: { pane: secondClientId } }))
				.status,
		).toBe(200);
		await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane A" && value.reason === claimWhy,
			"the surviving pane to regain the header and dock",
		);
		const takeoverId = claimedWrite.body.elements?.[0]?.id ?? claimedWrite.body.element?.id;
		expect(typeof takeoverId).toBe("string");
		const framed = await request("/api/viewport", {
			method: "POST",
			body: { scrollToElementId: takeoverId },
		});
		expect(framed.status).toBe(200);
		let priorDragPoint = "";
		let stableDragPoints = 0;
		const dragPoint = await pollUntil(
			() =>
				browser.eval<{ error?: string; inside?: boolean; x?: number; y?: number }>(`(() => {
					const app = ${EXCALIDRAW_APP_EXPRESSION};
					const element = app?.scene.getElementsIncludingDeleted()
						.find(candidate => candidate.id === ${JSON.stringify(takeoverId)});
					const canvas = document.querySelector(".excalidraw")?.getBoundingClientRect();
					if (!app || !element || !canvas) return { error: "takeover target is missing" };
					const zoom = app.state.zoom?.value ?? 1;
					const x = Math.round((element.x + 24 + app.state.scrollX) * zoom + app.state.offsetLeft);
					const y = Math.round((element.y + 24 + app.state.scrollY) * zoom + app.state.offsetTop);
					return { x, y, inside: x >= canvas.left && x <= canvas.right && y >= canvas.top && y <= canvas.bottom };
				})()`),
			(value) => {
				const sample = `${value.x}:${value.y}`;
				stableDragPoints = sample === priorDragPoint ? stableDragPoints + 1 : 0;
				priorDragPoint = sample;
				return value.inside === true && stableDragPoints >= 3;
			},
			"the claimed element to be framed inside the canvas",
		);
		expect(dragPoint.inside).toBe(true);
		const serverBefore = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === takeoverId)!;
		const countsBeforeTakeover = await claimCounts(browser);
		await browser.eval("window.__delayNextClaimReport()");
		await browser.run(["mouse", "move", String(dragPoint.x), String(dragPoint.y)]);
		await browser.run(["mouse", "down"]);
		for (let segment = 1; segment <= 4; segment += 1) {
			await browser.run(["mouse", "move", String(dragPoint.x! + segment * 9), String(dragPoint.y)]);
		}
		await browser.run(["mouse", "up"]);
		const pendingTakeover = await pollUntil(
			() => claimCounts(browser),
			(value) => value.pending === 1,
			"the content takeover report to remain pending before persistence",
		);
		const localTakeover = await pageElement(browser, takeoverId!);
		const serverBeforeReport = (
			await request<ElementsBody>(`/api/elements?board=${BOARD}`)
		).body.elements.find((element) => element.id === takeoverId)!;
		expect(localTakeover!.x).toBeGreaterThan(serverBefore.x + 20);
		expect(serverBeforeReport.x).toBeCloseTo(serverBefore.x, 3);
		expect(pendingTakeover.holds - countsBeforeTakeover.holds).toBe(1);
		expect(
			(await browser.eval<{ released: boolean }>("window.__releaseClaimReport()")).released,
		).toBe(true);
		const converged = await pollUntil(
			async () => ({
				local: await pageElement(browser, takeoverId!),
				server: (await request<ElementsBody>(`/api/elements?board=${BOARD}`)).body.elements.find(
					(element) => element.id === takeoverId,
				),
			}),
			(value) =>
				value.local !== null &&
				value.server !== undefined &&
				Math.abs(value.local.x - value.server.x) < 0.001,
			"the local pointer edit to converge with persistence",
		);
		expect(converged.server!.x).toBeCloseTo(converged.local!.x, 3);
		const contentRevoked = await request<WriteBody>(`/api/elements?board=${BOARD}`, {
			method: "POST",
			body: { type: "rectangle", x: 880, y: 880, width: 20, height: 20 },
		});
		expect(contentRevoked.status).toBe(409);
		expect(contentRevoked.body.code).toBe("CLAIM_REVOKED");
		const contentToldOnce = await request<WriteBody>(`/api/elements?board=${BOARD}`, {
			method: "POST",
			body: { type: "rectangle", x: 880, y: 900, width: 20, height: 20 },
		});
		expect(contentToldOnce.status).toBe(200);
		const noteBeforePresentation = await verifyBoardStatusPresentation({
			board: BOARD,
			browser,
			noteFile,
			readStatus: () => readBanner(browser),
			request,
		});

		const explicitWhy = "checking the explicit take-back control";
		expect(
			(
				await request(`/api/boards/claim?board=${BOARD}`, {
					method: "POST",
					body: { reason: explicitWhy },
				})
			).status,
		).toBe(200);
		const explicitClaim = await pollUntil(
			() => readBanner(browser),
			(value) => value.reason === explicitWhy && value.banner !== null,
			"the second claim's exact control to appear",
		);
		expect(explicitClaim.reason).toBe(explicitWhy);
		expect(explicitClaim.take).toBe("Take back control");
		await verifyPaneScopedTakeBack({
			board: BOARD,
			browser,
			primaryClientId: clientId,
			readStatus: () => readBanner(browser),
			reason: explicitWhy,
			request,
		});
		expectNoteUnchanged(noteFile, noteBeforePresentation);

		const lost = await request<WriteBody>(`/api/elements?board=${BOARD}`, {
			method: "POST",
			body: { type: "rectangle", x: 900, y: 900, width: 20, height: 20 },
		});
		expect(lost.status).toBe(409);
		expect(lost.body.code).toBe("CLAIM_REVOKED");
		expect(
			(
				await request<WriteBody>(`/api/elements?board=${BOARD}`, {
					method: "POST",
					body: { type: "rectangle", x: 920, y: 920, width: 20, height: 20 },
				})
			).status,
		).toBe(200);

		await canvas.restart({
			whileStopped: async () => {
				const disconnected = await pollUntil(
					() => readBanner(browser),
					(value) => value.view === true && value.connection === "Disconnected",
					"the disconnected pane to fail closed as held",
				);
				expect(disconnected).toMatchObject({ connection: "Disconnected", view: true });
				expect(disconnected.banner).toBeNull();
			},
		});
		const reconnected = await pollUntil(
			() => readBanner(browser),
			(value) => value.view === false && value.connection === "Connected",
			"the header and pane to recover after reconnection",
		);
		expect(reconnected).toMatchObject({ view: false, connection: "Connected" });

		await canvas.dispose();
		await pollUntil(
			() => readBanner(browser),
			(value) => value.view === true && value.connection === "Disconnected",
			"the stopped canvas to remain fail closed",
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 6,
);
