import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import {
	REPORT_IDLE_SETTLE_MS,
	REPORT_PROGRESS_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { LIVE_SESSION_BOARD, LIVE_SESSION_SEED } from "./fixtures/live-session-scene.js";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.js";
import {
	applyPageEdit,
	armServerUpdateEdit,
	canonicalise,
	delayNextReport,
	elementFields,
	IGNORED_FIELDS,
	inExcalidrawApp,
	injectedPageEditCount,
	installLiveEditSupport,
	installReportCounter,
	installServerUpdateInjector,
	readReportStats,
	type PageEdit,
	snapshotOf,
	type SnapshotElement,
} from "./support/page-scene.js";

setDefaultTimeout(TEST_BROWSER_COMMAND_TIMEOUT_MS);

const repoRoot = resolve(import.meta.dir, "../../..");
const MEASURER_EPSILON = 0.0012;

type Upsert = { id: string } & Record<string, unknown>;
type ReadField = (element: ServerElement | undefined) => string | number | undefined;

function elementName(element: SnapshotElement): string {
	return element.type === "text"
		? `${element.id} (text ${JSON.stringify(element.text)})`
		: `${element.id} (${element.type})`;
}

function divergences(server: SnapshotElement[], pane: SnapshotElement[]): string[] {
	const ours = new Map(server.map((element) => [element.id, element]));
	const theirs = new Map(pane.map((element) => [element.id, element]));
	const found: string[] = [];
	for (const [id, element] of ours) {
		const other = theirs.get(id);
		if (!other) {
			found.push(`${elementName(element)}: the server holds it, the pane does not`);
			continue;
		}
		const keys = [
			...new Set([...Object.keys(element.fields), ...Object.keys(other.fields)]),
		].toSorted();
		for (const key of keys) {
			const serverValue = element.fields[key] ?? "<absent>";
			const paneValue = other.fields[key] ?? "<absent>";
			if (serverValue === paneValue) continue;
			const widthsAgree =
				element.type === "text" &&
				key === "width" &&
				Number.isFinite(Number(serverValue)) &&
				Number.isFinite(Number(paneValue)) &&
				Math.abs(Number(serverValue) - Number(paneValue)) < MEASURER_EPSILON;
			if (!widthsAgree) {
				found.push(`${elementName(element)} .${key}: server ${serverValue} / pane ${paneValue}`);
			}
		}
	}
	for (const [id, element] of theirs) {
		if (!ours.has(id))
			found.push(`${elementName(element)}: the pane holds it, the server does not`);
	}
	return found;
}

async function paneSnapshot(browser: AgentBrowserSession): Promise<SnapshotElement[]> {
	const answer = await browser.eval<{ error?: string; elements?: SnapshotElement[] }>(
		inExcalidrawApp(`
const canonicalise = ${canonicalise.toString()};
const elementFields = ${elementFields.toString()};
const ignored = ${JSON.stringify(IGNORED_FIELDS)};
return {
  elements: app.scene.getElementsIncludingDeleted()
    .filter((element) => !element.isDeleted)
    .toSorted((left, right) => left.id < right.id ? -1 : 1)
    .map((element) => elementFields(element, ignored)),
};
`),
	);
	if (answer.error || !answer.elements)
		throw new Error(answer.error ?? "pane returned no elements");
	return answer.elements;
}

test("server updates cannot absorb ordered user edits or queued reports", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "server-ordering-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: join(root, "vault"),
		env: canvasTestEnvironment({ LOG_FILE_PATH: join(root, "canvas.log") }),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const held = async (): Promise<ServerElement[]> =>
		(await request<{ elements: ServerElement[] }>(`/api/elements?board=${LIVE_SESSION_BOARD}`)).body
			.elements;

	await request("/api/boards/new", {
		method: "POST",
		body: { board: LIVE_SESSION_BOARD, level: "service" },
		doing: "preparing deterministic server-update ordering",
	});
	await request(`/api/elements/changes?board=${LIVE_SESSION_BOARD}`, {
		method: "POST",
		body: { origin: "agent", upserts: LIVE_SESSION_SEED },
		doing: "seeding deterministic server-update ordering",
	});
	await request("/api/boards/save", {
		method: "POST",
		body: { board: LIVE_SESSION_BOARD },
		doing: "saving deterministic server-update ordering",
	});

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	await pollUntil(
		async () => (await request<{ paneCount: number }>("/api/panes")).body.paneCount,
		(count) => count === 1,
		"the ordering browser to register its pane",
	);
	// Every browser owner proves it never maps a window.
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	await request("/api/boards/open", {
		method: "POST",
		body: { board: LIVE_SESSION_BOARD, reload: true },
		doing: "opening deterministic server-update ordering",
	});
	await installReportCounter(browser);
	await installLiveEditSupport(browser);
	await installServerUpdateInjector(browser);
	await browser.run(["click", ".excalidraw"]);
	await pollUntil(
		() => browser.eval<boolean>("document.fonts.check('20px Excalifont')"),
		Boolean,
		"Excalifont to load before the ordered retype",
	);

	const agreement = async (): Promise<string[]> =>
		pollUntil(
			async () => divergences(snapshotOf(await held()), await paneSnapshot(browser)),
			(found) => found.length === 0,
			"the pane and note-backed server document to converge",
		);
	await agreement();

	const duringServerUpdate = async (
		label: string,
		agentUpserts: Upsert[],
		edit: PageEdit,
		reads: ReadField,
		wants: (value: string | number | undefined) => string | number | undefined,
	): Promise<void> => {
		const was = reads((await held()).find((element) => element.id === edit.id));
		const wanted = wants(was);
		const reportsBefore = await readReportStats(browser);
		const injectedBefore = await injectedPageEditCount(browser);
		await armServerUpdateEdit(browser, edit);
		await request(`/api/elements/changes?board=${LIVE_SESSION_BOARD}`, {
			method: "POST",
			body: { origin: "agent", upserts: agentUpserts },
			doing: label,
		});
		const injected = await pollUntil(
			() => injectedPageEditCount(browser),
			(count) => count > injectedBefore,
			`${label} to inject between updateScene and baseline recording`,
		);
		expect({ label, injected: injected - injectedBefore }).toEqual({ label, injected: 1 });
		const settled = await agreement();
		expect({ label, divergences: settled }).toEqual({ label, divergences: [] });
		const after = (await held()).find((element) => element.id === edit.id);
		const got = reads(after);
		if (typeof wanted === "number" && typeof got === "number") {
			expect(Math.abs(got - wanted)).toBeLessThan(0.001);
		} else {
			expect({ label, got }).toEqual({ label, got: wanted });
		}
		await pollUntil(
			() => readReportStats(browser),
			(stats) => stats.done > reportsBefore.done,
			`${label} user report to finish`,
		);
		await Bun.sleep(REPORT_IDLE_SETTLE_MS);
		const stableReports = await readReportStats(browser);
		// Coverage uplift: the server broadcast itself emits no pane report.
		expect({
			label,
			sent: stableReports.sent - reportsBefore.sent,
			done: stableReports.done - reportsBefore.done,
		}).toEqual({ label, sent: 1, done: 1 });
	};

	await duringServerUpdate(
		"an agent recolours the box a user is resizing",
		[{ id: "store", backgroundColor: "#e9ecef" }],
		{ kind: "resize", id: "store", dw: 13, dh: 0 },
		(element) => element?.width,
		(value) => Number(value) + 13,
	);
	const storeLabel = (await held()).find(
		(element) => element.type === "text" && element.containerId === "store",
	);
	if (storeLabel?.type !== "text") throw new Error("store label is not text");
	expect(typeof storeLabel?.id).toBe("string");
	await duringServerUpdate(
		"an agent relabels the box a user is typing in",
		[{ id: "store", label: { text: "written by the agent" } }],
		{ kind: "retype", id: storeLabel!.id, text: "typed by the person" },
		(element) => (element?.type === "text" ? element.text : undefined),
		() => "typed by the person",
	);
	await request(`/api/elements/changes?board=${LIVE_SESSION_BOARD}`, {
		method: "POST",
		body: {
			origin: "agent",
			upserts: [{ id: "spare", type: "rectangle", x: 900, y: 620, width: 160, height: 70 }],
		},
		doing: "adding the deterministic deletion target",
	});
	await agreement();
	await duringServerUpdate(
		"an agent recolours the box a user is deleting",
		[{ id: "spare", backgroundColor: "#ffe3e3" }],
		{ kind: "delete", id: "spare" },
		(element) => (element ? "on the board" : "gone"),
		() => "gone",
	);
	await duringServerUpdate(
		"an agent writes elsewhere while a user moves a box",
		[{ id: "queue", backgroundColor: "#e3fafc" }],
		{ kind: "move", id: "store", dx: 17, dy: -9 },
		(element) => element?.x,
		(value) => Number(value) + 17,
	);

	const drifted = (await held()).find((element) => element.id === "store")!;
	const sparseBefore = await readReportStats(browser);
	await delayNextReport(browser, Math.round(REPORT_PROGRESS_MS * 1.5));
	await browser.eval(`(() => {
  window.__archboardSparseSecondEditAt = 0;
  window.__archboardApplyPageEdit({ kind: 'move', id: 'store', dx: 5, dy: 0 });
  setTimeout(() => {
    window.__archboardSparseSecondEditAt = performance.now();
    window.__archboardApplyPageEdit({ kind: 'move', id: 'store', dx: 7, dy: 0 });
  }, ${Math.round(REPORT_PROGRESS_MS * 1.15)});
  return true;
})()`);
	const sparseFinished = await pollUntil(
		async () => ({
			stats: await readReportStats(browser),
			secondEditAt: await browser.eval<number>("window.__archboardSparseSecondEditAt"),
		}),
		(value) => value.secondEditAt > 0 && value.stats.done > sparseBefore.done,
		"the overdue sparse-drag report to finish",
	);
	const sparseAnswer = sparseFinished.stats.reportAnswers.at(-1)!;
	expect(sparseAnswer - sparseFinished.secondEditAt).toBeGreaterThan(REPORT_PROGRESS_MS);
	const sparseAgreement = await agreement();
	expect(sparseAgreement).toEqual([]);
	const sparseStore = (await held()).find((element) => element.id === "store");
	expect(sparseStore?.x).toBe(drifted.x + 12);

	const queuedStart = (await held()).find((element) => element.id === "auth")!;
	const queuedBefore = await readReportStats(browser);
	await delayNextReport(browser, REPORT_PROGRESS_MS * 3);
	await browser.eval(`(() => {
  window.__archboardApplyPageEdit({ kind: 'move', id: 'auth', dx: 3, dy: 0 });
  setTimeout(() => window.__archboardApplyPageEdit(
    { kind: 'move', id: 'auth', dx: 5, dy: 0 }
  ), ${Math.round(REPORT_PROGRESS_MS * 1.15)});
  return true;
})()`);
	await pollUntil(
		() => readReportStats(browser),
		(stats) => stats.sent > queuedBefore.sent && stats.done === queuedBefore.done,
		"the first auth report to remain in flight",
	);
	await applyPageEdit(browser, { kind: "move", id: "auth", dx: 7, dy: 0 });
	await applyPageEdit(browser, { kind: "move", id: "auth", dx: 11, dy: 0 });
	const queued = await pollUntil(
		async () => ({ stats: await readReportStats(browser), board: await held() }),
		(value) =>
			value.stats.done >= queuedBefore.done + 2 &&
			value.board.some((element) => element.id === "auth" && element.x === queuedStart.x + 26),
		"the latest edit queued behind an in-flight report to persist",
	);
	// Coverage uplift: one latest queued report survives while intermediate state coalesces.
	expect(queued.stats.sent - queuedBefore.sent).toBe(2);
	expect(queued.stats.done - queuedBefore.done).toBe(2);
	expect(queued.board.find((element) => element.id === "auth")?.x).toBe(queuedStart.x + 26);
	// Exact final convergence, with only the documented text-width measurer allowance.
	expect(await agreement()).toEqual([]);
});
