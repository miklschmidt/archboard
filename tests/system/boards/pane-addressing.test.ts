import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	MAX_PANES,
	panesInOrder,
	resolvePaneSpec,
	soloPane,
	type PaneRegistration,
} from "../../../src/runtime/engine/panes.ts";
import { TEST_PANE_SOCKET_SETTLE_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { openTestPane, type PaneMessage, type TestPane } from "./support/pane-websocket.ts";

interface PaneReport {
	paneCount: number;
	sameBoard?: boolean;
	text?: string;
	panes: Array<{
		paneId: string;
		clientId: string;
		board: string;
		selection?: { count: number };
	}>;
}

interface PaneAction {
	paneCount: number;
	pane?: { clientId: string; place: string };
	closed?: { clientId: string; place: string };
	error?: string;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-pane-addressing-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const panes: TestPane[] = [];
const paneFixture = (clientId: string, x: number, board: string): PaneRegistration => ({
	clientId,
	paneId: `pane-${clientId}`,
	board,
	primary: clientId === "a",
	focused: false,
	elementCount: 0,
	rect: { x, y: 0, width: 640, height: 800 },
	viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
	at: "2026-08-28T00:00:00.000Z",
});
const refusalMessage = (call: () => unknown): string => {
	try {
		call();
		return "";
	} catch (error) {
		return (error as Error).message;
	}
};
let left: TestPane;
let right: TestPane;
const startup = {
	initialBoard: undefined as string | undefined,
	openStatus: 0,
	openPlace: undefined as string | undefined,
	adoptedBoard: undefined as string | undefined,
	mirroredBoard: undefined as string | undefined,
	addressedStatus: 0,
	addressedPlace: undefined as string | undefined,
	addressedRightSawSwitch: false,
	addressedLeftUntouched: false,
};

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
	await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
	await request("/api/boards/new", { method: "POST", body: { board: "payments@option-a" } });
	left = await createPane("p-left", 0, true);
	startup.initialBoard = left.board();
	const opened = await request<PaneAction>("/api/boards/open", {
		method: "POST",
		body: { board: "payments" },
	});
	startup.openStatus = opened.status;
	startup.openPlace = opened.body.pane?.place;
	await left.adopt("payments");
	startup.adoptedBoard = left.board();
	right = await createPane("p-right", 640);
	startup.mirroredBoard = right.board();
	const leftStart = left.since();
	const addressed = await request<PaneAction>("/api/boards/open", {
		method: "POST",
		body: { board: "payments@option-a", pane: "right" },
	});
	await right.adopt("payments@option-a");
	startup.addressedStatus = addressed.status;
	startup.addressedPlace = addressed.body.pane?.place;
	startup.addressedRightSawSwitch = right.seen.some(
		(message) => message.type === "board_switched" && message.board === "payments@option-a",
	);
	startup.addressedLeftUntouched = left.seen
		.slice(leftStart)
		.every((message) => message.type !== "board_switched");
});

afterAll(async () => {
	await Promise.all(panes.map((openPane) => openPane.close()));
	await canvas?.dispose();
});

async function createPane(clientId: string, x: number, primary = false): Promise<TestPane> {
	const opened = await openTestPane(canvas.base, request, clientId, x, {
		primary,
		focused: primary,
	});
	panes.push(opened);
	return opened;
}

describe("pane addressing", () => {
	test("opens and adopts the first board before a second pane mirrors it", () => {
		expect(startup.initialBoard).toBe("scratch");
		expect(startup.openStatus).toBe(200);
		expect(startup.openPlace).toBe("the only pane");
		expect(startup.adoptedBoard).toBe("payments");
		expect(startup.mirroredBoard).toBe("payments");
		expect(startup.addressedStatus).toBe(200);
		expect(startup.addressedPlace).toBe("right");
		expect(startup.addressedRightSawSwitch).toBeTrue();
		expect(startup.addressedLeftUntouched).toBeTrue();
	});

	test("orders and resolves the direct pane vocabulary without guessing", () => {
		const directRight = { ...paneFixture("b", 640, "payments@option-a"), focused: true };
		const directLeft = paneFixture("a", 0, "payments");
		const two = [directRight, directLeft];

		expect(
			panesInOrder(two).map((entry) => [entry.pane.clientId, entry.position, entry.place]),
		).toEqual([
			["a", 1, "left"],
			["b", 2, "right"],
		]);
		expect(resolvePaneSpec(two, "left")).toBe(directLeft);
		expect(resolvePaneSpec(two, "right")).toBe(directRight);
		expect(resolvePaneSpec(two, "2")).toBe(directRight);
		expect(resolvePaneSpec(two, "primary")).toBe(directLeft);
		expect(resolvePaneSpec(two, "focused")).toBe(directRight);
		expect(resolvePaneSpec(two, "pane-b")).toBe(directRight);
		expect(refusalMessage(() => resolvePaneSpec(two, "middle"))).toBe(
			'No pane called "middle". Panes on screen: 1. left (payments), 2. right (payments@option-a). ' +
				"--pane takes a place (left, right, top, bottom), a position (1, 2), `focused`, `primary`, or a pane id.",
		);
		expect(() => resolvePaneSpec([directLeft], "right")).toThrow(/archboard pane open/);
		expect(() => resolvePaneSpec([directLeft], "only")).toThrow(/No pane called "only"/);
		expect(MAX_PANES).toBe(2);
		expect(soloPane([directLeft])).toBe(directLeft);
		expect(soloPane([])).toBeNull();
		expect(refusalMessage(() => soloPane(two))).toBe(
			"2 panes are open, so this needs a pane as well as a board — --pane left | right. " +
				"They are showing payments (left), payments@option-a (right).",
		);
	});

	test("switches only the addressed pane and reports reading order", async () => {
		const report = await request<PaneReport>("/api/panes");
		expect(report.body.sameBoard).toBeFalse();
		expect(report.body.panes.map((entry) => entry.board)).toEqual([
			"payments",
			"payments@option-a",
		]);
		expect(report.body.text).not.toContain("one board at a time");
		expect(report.body.text).toContain("refused until one is named");
	});

	test("keeps every public pane spelling aligned with CLI help", async () => {
		const paneSource = fs.readFileSync(path.join(repoRoot, "src/runtime/engine/panes.ts"), "utf8");
		const specs = paneSource.match(/const PANE_SPECS\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
		const cliSource = fs.readFileSync(path.join(repoRoot, "src/cli/commands/run.ts"), "utf8");
		const named = ["left", "right", "top", "bottom", "focused", "primary"];
		expect(named.every((word) => specs.includes(word))).toBeTrue();
		expect(named.every((word) => cliSource.includes(word))).toBeTrue();
		const undocumented = await request<{ error?: string }>("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: "only" },
		});
		expect(undocumented.status).toBe(400);
		expect(undocumented.body.error).toContain('No pane called "only"');
		expect(named.some((word) => undocumented.body.error?.includes(word))).toBeTrue();
	});

	test("keeps selection with the pane that made it", async () => {
		const made = await request<{ element: { id: string } }>(
			"/api/elements?board=payments@option-a",
			{
				method: "POST",
				body: { type: "rectangle", x: 10, y: 10, width: 100, height: 60 },
			},
		);
		await request("/api/selection", {
			method: "POST",
			body: { elementIds: [made.body.element.id], clientId: right.clientId },
		});
		await left.adopt("payments");
		const report = await request<PaneReport>("/api/panes");
		expect(
			report.body.panes.find((entry) => entry.paneId === right.clientId)?.selection?.count,
		).toBe(1);
		expect(
			report.body.panes.find((entry) => entry.paneId === left.clientId)?.selection?.count,
		).toBe(0);
		await request("/api/elements/clear?board=payments", { method: "DELETE" });
		const after = await request<PaneReport>("/api/panes");
		expect(
			after.body.panes.find((entry) => entry.paneId === right.clientId)?.selection?.count,
		).toBe(1);
	});

	test("addresses viewport movement to one pane", async () => {
		const leftStart = left.since();
		const rightStart = right.since();
		const reply = async (message: PaneMessage): Promise<void> => {
			if (message.type !== "set_viewport") return;
			await request("/api/viewport/result", {
				method: "POST",
				body: { requestId: message.requestId, success: true },
			});
		};
		right.socket.on("message", (data) => void reply(JSON.parse(data.toString()) as PaneMessage));
		const moved = await request<{ success: boolean }>("/api/viewport", {
			method: "POST",
			body: { scrollToContent: true, pane: "right" },
		});
		expect(moved.status).toBe(200);
		expect(
			right.seen.slice(rightStart).some((message) => message.type === "set_viewport"),
		).toBeTrue();
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "set_viewport"),
		).toBeFalse();
		const missing = await request<{ error?: string }>("/api/viewport", {
			method: "POST",
			body: { scrollToContent: true, pane: "middle" },
		});
		expect(missing.status).toBe(400);
		expect(missing.body.error).toContain('No pane called "middle"');
	});

	test("opens and closes a registered second pane through the shell messages", async () => {
		await right.close();
		await Bun.sleep(TEST_PANE_SOCKET_SETTLE_MS);
		const onePane = await request<PaneReport>("/api/panes");
		expect(onePane.body.paneCount).toBe(1);
		expect(onePane.body.panes[0]?.board).toBe("payments");
		expect(onePane.body.text).toContain("archboard pane open");
		const leftStart = left.since();
		let shellPane: TestPane | undefined;
		left.socket.on("message", (data) => {
			const message = JSON.parse(data.toString()) as PaneMessage;
			if (message.type === "pane_open") {
				void createPane("p-shell", 640).then((opened) => {
					shellPane = opened;
					return undefined;
				});
			}
		});
		const split = await request<PaneAction>("/api/panes/open", { method: "POST" });
		expect(split.status).toBe(200);
		expect(split.body).toMatchObject({ paneCount: 2, pane: { place: "right" } });
		expect(shellPane?.board()).toBe("payments");
		expect(
			left.seen.slice(leftStart).some((message) => message.type === "board_switched"),
		).toBeFalse();
		const opened = await request<PaneAction>("/api/boards/open", {
			method: "POST",
			body: { board: "payments@option-a", pane: "right" },
		});
		expect(opened.status).toBe(200);
		expect(opened.body.pane?.place).toBe("right");
		await shellPane!.adopt("payments@option-a");
		expect((await request<PaneReport>("/api/panes")).body.sameBoard).toBeFalse();

		shellPane!.socket.on("message", (data) => {
			const message = JSON.parse(data.toString()) as PaneMessage;
			if (message.type === "pane_close") void shellPane!.close();
		});
		const closed = await request<PaneAction>("/api/panes/close", {
			method: "POST",
			body: { pane: "right" },
		});
		expect(closed.status).toBe(200);
		expect(closed.body).toMatchObject({ paneCount: 1, closed: { place: "right" } });
		const survivor = (await request<PaneReport>("/api/panes")).body.panes[0];
		expect(survivor?.paneId).toBe("p-left");
		expect(survivor?.board).toBe("payments");
		const boards = await request<{ open: Array<{ key: string }> }>("/api/boards");
		expect(boards.body.open.some((entry) => entry.key === "payments@option-a")).toBeTrue();
	});
});
