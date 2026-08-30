import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
	PANE_DEBOUNCE_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_PANE_DEBOUNCE_MARGIN_MS,
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

interface ElementsBody {
	elements: ExcalidrawElement[];
}
interface PaneList {
	paneCount: number;
	panes: Array<{ board: string; clientId: string }>;
}

interface WriteBody {
	code?: string;
	element?: ExcalidrawElement;
	elements?: ExcalidrawElement[];
	error?: string;
}
interface ClaimBody {
	claim: { holder: { id?: string; kind?: string; reason?: string; claimed?: boolean } };
}

interface ClaimCounts {
	holds: number;
	pending: number;
	sent: number;
}

interface ClaimBanner {
	bar: string | null;
	beacon: string | null;
	copy: string | null;
	heading: string | null;
	holder: string | null;
	live: string | null;
	pane: string | null;
	reason: string | null;
	state: string | null;
	steps: string[];
	take: string | null;
	view: boolean | null;
	what: string | null;
	headerClaim: {
		beacon: string;
		label: string;
		id: string;
		labelType: [string, number, number];
		idType: [string, number, number];
		height: number;
	} | null;
}

type Request = ReturnType<typeof createJsonRequester>;

async function openSeededBoard(resources: AsyncDisposableStack): Promise<{
	browser: AgentBrowserSession;
	canvas: Awaited<ReturnType<typeof startOwnedCanvas>>;
	clientId: string;
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
	expect(
		(await request("/api/boards/save", { method: "POST", body: { board: BOARD } })).status,
	).toBe(200);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
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
	return { browser, canvas, clientId: panes.panes[0]!.clientId, request };
}

const installClaimRecorder = (browser: AgentBrowserSession): Promise<unknown> =>
	browser.eval(`(() => {
		window.__claimRecorder = { holds: 0, sent: 0, delay: false, pending: [] };
		window.__delayNextClaimReport = () => { window.__claimRecorder.delay = true; };
		window.__releaseClaimReport = () => {
			const entry = window.__claimRecorder.pending.shift();
			if (!entry) return { released: false };
			entry.release();
			return { released: true };
		};
		const original = window.fetch;
		window.fetch = function(input, init) {
			const invoke = () => original.apply(this, arguments);
			const url = typeof input === "string" ? input : input?.url ?? "";
			const method = init?.method ?? input?.method ?? "GET";
			const report = method === "POST" && url.includes("/api/elements/changes");
			const hold = method === "POST" && url.includes("/api/boards/hold")
				&& !url.includes("/api/boards/hold/release");
			if (report) window.__claimRecorder.sent += 1;
			if (hold) window.__claimRecorder.holds += 1;
			if (!report || !window.__claimRecorder.delay) return invoke();
			window.__claimRecorder.delay = false;
			return new Promise((resolve, reject) => {
				window.__claimRecorder.pending.push({ release: () => invoke().then(resolve, reject) });
			});
		};
		return { installed: true };
	})()`);

const claimCounts = (browser: AgentBrowserSession): Promise<ClaimCounts> =>
	browser.eval(`(() => ({
		holds: window.__claimRecorder.holds,
		sent: window.__claimRecorder.sent,
		pending: window.__claimRecorder.pending.length,
	}))()`);

const readBanner = (browser: AgentBrowserSession): Promise<ClaimBanner> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		const what = document.querySelector(".pane-claim-what");
		const headerClaim = document.querySelector(".bar-claim");
		const headerLabel = headerClaim?.querySelector(".claim-label");
		const headerId = headerClaim?.querySelector(".claim-id");
		return {
			beacon: document.querySelector(".claim-beacon span")?.textContent?.trim() ?? null,
			holder: document.querySelector(".claim-kicker")?.textContent?.trim() ?? null,
			live: document.querySelector(".workbench-overview")?.getAttribute("aria-live") ?? null,
			pane: document.querySelector(".workbench-pane")?.lastChild?.textContent?.trim() ?? null,
			heading: what?.querySelector("small")?.textContent?.trim() ?? null,
			reason: what?.lastChild?.textContent?.trim() ?? null,
			copy: document.querySelector(".claim-copy")?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
			take: document.querySelector(".pane-claim-take")?.textContent?.trim() ?? null,
			state: document.querySelector(".agent-workbench")?.getAttribute("data-state") ?? null,
			steps: [...document.querySelectorAll(".pane-doing-text")]
				.map(line => line.textContent?.trim() ?? ""),
			bar: document.querySelector(".doing-now")?.textContent?.trim() ?? null,
			view: app ? app.state.viewModeEnabled === true : null,
			what: what?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
			headerClaim: headerClaim && headerLabel && headerId ? {
				beacon: getComputedStyle(headerClaim.querySelector(".dot")).backgroundColor,
				label: headerLabel.textContent?.trim() ?? "",
				id: headerId.textContent?.trim() ?? "",
				labelType: [getComputedStyle(headerLabel).fontFamily.toLowerCase(),
					parseFloat(getComputedStyle(headerLabel).fontSize),
					parseFloat(getComputedStyle(headerLabel).lineHeight)],
				idType: [getComputedStyle(headerId).fontFamily.toLowerCase(),
					parseFloat(getComputedStyle(headerId).fontSize),
					parseFloat(getComputedStyle(headerId).lineHeight)],
				height: headerClaim.getBoundingClientRect().height,
			} : null,
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
		const { browser, canvas, clientId, request } = await openSeededBoard(resources);
		await installClaimRecorder(browser);
		await browser.run(["click", ".workbench-toggle"]);
		const initial = await readBanner(browser);
		expect(initial).toMatchObject({ live: "polite", pane: "Pane A", state: "ready" });
		expect(initial.headerClaim).toBeNull();
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
			(value) => value.reason === claimWhy,
			"the claimed-board explanation to become readable",
		);
		expect(claimed.holder).toBe("Agent has the board");
		expect(claimed.reason).toBe(claimWhy);
		expect(claimed.what).toContain(claimWhy);
		expect(claimed.view).toBe(false);
		expect(claimed.take).toBe("Take back control");
		expect(claimed.beacon).toBe("Agent claim");
		expect(claimed.heading).toBe("Active claim");
		expect(claimed.state).toBe("working");
		expect(claimed.copy).toBe(
			"Agent edits are serialized while this claim is active. You can return control at any time.",
		);
		expect(claimed.headerClaim).toMatchObject({
			beacon: "rgb(163, 230, 53)",
			label: "Claimed by",
			id: claim.body.claim.holder.id,
			height: 44,
		});
		expect(claimed.headerClaim?.labelType.slice(1)).toEqual([12, 16]);
		expect(claimed.headerClaim?.idType.slice(1)).toEqual([10, 14]);
		expect(claimed.headerClaim?.labelType[0]).toContain("inter");
		expect(claimed.headerClaim?.idType[0]).toMatch(/mono|consolas/);

		const beforeCamera = await claimCounts(browser);
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
		await Bun.sleep(PANE_DEBOUNCE_MS + TEST_PANE_DEBOUNCE_MARGIN_MS);
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
		const narrated = await pollUntil(
			() => readBanner(browser),
			(value) => value.steps[0] === step && value.bar === step,
			"the latest per-write narration to reach the pane and off-pane bar",
		);
		expect(narrated.steps[0]).toBe(step);
		expect(narrated.bar).toBe(step);
		expect(narrated.reason).toBe(claimWhy);
		expect(narrated.holder).toBe("Agent has the board");
		expect(narrated.copy).toBe(
			"Agent edits are serialized while this claim is active. You can return control at any time.",
		);

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
					body: { board: "workbench-other", pane: secondClientId },
				})
			).status,
		).toBe(200);
		await browser.run(["click", '.pane[aria-label="Pane B"] .excalidraw']);
		const paneB = await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane B",
			"the workbench to follow Pane B focus",
		);
		expect(paneB).toMatchObject({ state: "ready", what: null, bar: null, steps: [] });
		expect(paneB.headerClaim).toBeNull();
		await browser.run(["click", '.pane[aria-label="Pane A"] .excalidraw']);
		const paneA = await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane A" && value.bar === step,
			"the workbench to restore Pane A claim and progress",
		);
		expect(paneA).toMatchObject({ state: "working", reason: claimWhy });
		await browser.run(["click", '.pane[aria-label="Pane B"] .excalidraw']);
		expect(
			(await request("/api/panes/close", { method: "POST", body: { pane: secondClientId } }))
				.status,
		).toBe(200);
		await pollUntil(
			() => readBanner(browser),
			(value) => value.pane === "Pane A" && value.reason === claimWhy,
			"the surviving pane to regain workbench focus",
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
			(value) => value.reason === explicitWhy,
			"the second claim's exact control to appear",
		);
		expect(explicitClaim.reason).toBe(explicitWhy);
		expect(explicitClaim.take).toBe("Take back control");
		await browser.eval(`(() => {
			window.__takeBackActivations = 0;
			document.querySelector(".pane-claim-take")?.addEventListener(
				"click",
				() => { window.__takeBackActivations += 1; },
				{ once: true },
			);
			return true;
		})()`);
		await browser.run(["click", ".pane-claim-take"]);
		expect(await browser.eval<number>("window.__takeBackActivations")).toBe(1);
		const returned = await pollUntil(
			() => readBanner(browser),
			(value) => value.what === null && value.view === false,
			"one activation to return editable control",
		);
		expect(returned).toMatchObject({ what: null, view: false, state: "ready", headerClaim: null });

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

		await canvas.restart();
		const disconnected = await pollUntil(
			() => readBanner(browser),
			(value) => value.view === true && value.state === "offline",
			"the disconnected pane to fail closed as held",
		);
		expect(disconnected).toMatchObject({ view: true, state: "offline" });
		expect(disconnected.headerClaim).toBeNull();
		const reconnected = await pollUntil(
			() => readBanner(browser),
			(value) => value.view === false && value.state === "ready",
			"the workbench and pane to recover after reconnection",
		);
		expect(reconnected).toMatchObject({ view: false, state: "ready" });

		await canvas.dispose();
		await pollUntil(
			() => readBanner(browser),
			(value) => value.view === true && value.state === "offline",
			"the stopped canvas to remain fail closed",
		);
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS * 6,
);
