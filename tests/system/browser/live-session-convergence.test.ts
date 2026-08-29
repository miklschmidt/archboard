import { expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { measureLineWidth } from "../../../src/runtime/engine/measure-text.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	LIVE_AGENT_MOVES,
	LIVE_HUMAN_MOVES,
	LIVE_PALETTE,
	LIVE_SESSION_BOARD,
	LIVE_SESSION_CYCLES,
	LIVE_SESSION_SEED,
	LIVE_SUBJECTS,
} from "./fixtures/live-session-scene.js";
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
	inExcalidrawApp,
	installLiveEditSupport,
	installReportCounter,
	readReportStats,
	type PageEdit,
} from "./support/page-scene.js";

setDefaultTimeout(TEST_BROWSER_COMMAND_TIMEOUT_MS * 4);

const repoRoot = resolve(import.meta.dir, "../../..");
const MEASURER_EPSILON = 0.0012;
const IGNORED_FIELDS = [
	"version",
	"versionNonce",
	"updated",
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
] as const;

interface SnapshotElement {
	id: string;
	type: string;
	text?: string;
	fields: Record<string, string | undefined>;
}

interface PaneSnapshot {
	error?: string;
	elements?: SnapshotElement[];
}

type Upsert = { id: string } & Record<string, unknown>;

function rotating<T>(values: readonly T[], cycle: number): T {
	return values[cycle % values.length]!;
}

function canonicalise(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalise);
	if (value && typeof value === "object") {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).toSorted()) {
			sorted[key] = canonicalise((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

function elementFields(
	element: Record<string, unknown>,
	ignored: readonly string[],
): SnapshotElement {
	const fields: Record<string, string | undefined> = {};
	for (const key of Object.keys(element).toSorted()) {
		if (!ignored.includes(key)) fields[key] = JSON.stringify(canonicalise(element[key]));
	}
	return {
		id: String(element.id),
		type: String(element.type),
		...(typeof element.text === "string" ? { text: element.text } : {}),
		fields,
	};
}

const snapshotOf = (elements: readonly ServerElement[]): SnapshotElement[] =>
	elements
		.filter((element) => !element.isDeleted)
		.toSorted((left, right) => (left.id < right.id ? -1 : 1))
		.map((element) => elementFields(element as unknown as Record<string, unknown>, IGNORED_FIELDS));

function measurementNoise(
	element: SnapshotElement,
	key: string,
	serverValue: string,
	paneValue: string,
): boolean {
	if (element.type !== "text" || key !== "width") return false;
	const serverWidth = Number(serverValue);
	const paneWidth = Number(paneValue);
	return (
		Number.isFinite(serverWidth) &&
		Number.isFinite(paneWidth) &&
		Math.abs(serverWidth - paneWidth) < MEASURER_EPSILON
	);
}

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
			if (serverValue !== paneValue && !measurementNoise(element, key, serverValue, paneValue)) {
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

async function paneSnapshot(browser: AgentBrowserSession): Promise<PaneSnapshot> {
	return browser.eval<PaneSnapshot>(
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
}

test("42 rotating agent and human cycles converge after every write pair", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const root = mkdtempSync(join(ownerRoot, "live-convergence-"));
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
		doing: "preparing the live convergence check",
	});
	const seeded = await request(`/api/elements/changes?board=${LIVE_SESSION_BOARD}`, {
		method: "POST",
		body: { origin: "agent", upserts: LIVE_SESSION_SEED },
		doing: "seeding the mixed-write board",
	});
	expect(seeded.status).toBe(200);
	expect((await held()).length).toBe(8);
	const saved = await request<{ file?: string }>("/api/boards/save", {
		method: "POST",
		body: { board: LIVE_SESSION_BOARD },
		doing: "saving the mixed-write seed",
	});
	expect(saved.status).toBe(200);
	expect(existsSync(saved.body.file ?? "")).toBe(true);

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	const panes = await pollUntil(
		async () => (await request<{ paneCount: number }>("/api/panes")).body,
		(value) => value.paneCount >= 1,
		"the live convergence browser to register its pane",
	);
	expect(panes.paneCount).toBe(1);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/Headless/i);
	const opened = await request<{ elementCount?: number }>("/api/boards/open", {
		method: "POST",
		body: { board: LIVE_SESSION_BOARD, reload: true },
		doing: "opening the mixed-write board",
	});
	expect(opened.status).toBe(200);
	expect(opened.body.elementCount).toBe(8);

	await installReportCounter(browser);
	await installLiveEditSupport(browser);
	await browser.run(["click", ".excalidraw"]);
	const probe = "typed at 2";
	const serverWidth = measureLineWidth(probe, 20, 5);
	const font = await pollUntil(
		() =>
			browser.eval<{ loaded: boolean; width: string }>(`(() => {
  const context = document.createElement('canvas').getContext('2d');
  context.font = '20px Excalifont';
  return { loaded: document.fonts.check('20px Excalifont'), width: String(context.measureText(${JSON.stringify(probe)}).width) };
})()`),
		(value) => value.loaded && Math.abs(Number(value.width) - serverWidth) < MEASURER_EPSILON,
		"Excalifont to produce the server measurer's width",
	);
	expect(font.loaded).toBe(true);
	expect(Math.abs(Number(font.width) - serverWidth)).toBeLessThan(MEASURER_EPSILON);

	const agreement = async (): Promise<string[]> =>
		pollUntil(
			async () => {
				const pane = await paneSnapshot(browser);
				if (pane.error || !pane.elements)
					throw new Error(pane.error ?? "pane returned no elements");
				return divergences(snapshotOf(await held()), pane.elements);
			},
			(value) => value.length === 0,
			"the pane and note-backed server document to agree",
		);
	expect(await agreement()).toEqual([]);

	let created = 0;
	let bothSides = 0;
	let bounced = 0;
	const madeIds: string[] = [];
	expect(LIVE_SESSION_CYCLES).toBe(42);
	for (let cycle = 1; cycle <= LIVE_SESSION_CYCLES; cycle += 1) {
		const before = await readReportStats(browser);
		const board = await held();
		const byId = new Map(board.map((element) => [element.id, element]));
		const subject = rotating(LIVE_SUBJECTS, cycle);
		const agentMove = rotating(LIVE_AGENT_MOVES, cycle);
		let upserts: Upsert[];
		if (agentMove === "create-labelled") {
			const id = `svc${cycle}`;
			madeIds.push(id);
			created += 1;
			upserts = [
				{
					id,
					type: "rectangle",
					x: 800 + (cycle % 5) * 40,
					y: 100 + cycle * 12,
					width: 180,
					height: 80,
					label: { text: `Service ${cycle}` },
				},
			];
		} else if (agentMove === "create-arrow") {
			const id = `arr${cycle}`;
			madeIds.push(id);
			created += 1;
			upserts = [
				{
					id,
					type: "arrow",
					x: 320,
					y: 360,
					points: [
						[0, 0],
						[120, 40],
					],
					start: { id: "store" },
					end: { id: "queue" },
				},
			];
		} else if (agentMove === "move") {
			const element = byId.get(subject)!;
			upserts = [{ id: subject, x: element.x + (cycle % 2 ? 7 : -7), y: element.y + 3 }];
		} else if (agentMove === "recolour") {
			upserts = [{ id: subject, backgroundColor: rotating(LIVE_PALETTE, cycle) }];
		} else {
			upserts = [{ id: subject, label: { text: `${subject} v${cycle}` } }];
		}
		const wrote = await request(`/api/elements/changes?board=${LIVE_SESSION_BOARD}`, {
			method: "POST",
			body: { origin: "agent", upserts },
			doing: `running mixed-write cycle ${cycle}`,
		});
		expect(wrote.status).toBe(200);

		const humanMove = rotating(LIVE_HUMAN_MOVES, cycle);
		let edit: PageEdit | null = null;
		if (humanMove === "move") {
			edit = { kind: "move", id: subject, dx: 11, dy: -5 };
			bothSides += 1;
		} else if (humanMove === "resize") {
			edit = { kind: "resize", id: subject, dw: cycle % 2 ? 6 : -6, dh: 0 };
			bothSides += 1;
		} else if (humanMove === "retype") {
			const label = board.find(
				(element) => element.type === "text" && element.containerId === subject,
			);
			edit = { kind: "retype", id: label?.id ?? "note", text: `typed at ${cycle}` };
		} else {
			const spare = madeIds.find((id) => id.startsWith("svc") && byId.has(id));
			if (spare) {
				madeIds.splice(madeIds.indexOf(spare), 1);
				edit = { kind: "delete", id: spare };
			}
		}
		if (edit) {
			const applied = (await applyPageEdit(browser, edit)) as { error?: string };
			expect(applied.error).toBeUndefined();
		}
		// Keep the assertion inside the loop so the first divergent cycle names both moves.
		expect({ cycle, agentMove, humanMove, divergences: await agreement() }).toEqual({
			cycle,
			agentMove,
			humanMove,
			divergences: [],
		});
		const after = await readReportStats(browser);
		if (after.done - before.done > (edit ? 1 : 0)) bounced += 1;
	}

	expect(created).toBeGreaterThan(0);
	expect(bothSides).toBeGreaterThan(0);
	expect(bounced).toBe(0);
});
