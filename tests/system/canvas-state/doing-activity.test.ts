import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TEST_PANE_SOCKET_SETTLE_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, sleep } from "./support/http.ts";
import { openPaneSession, type PaneEvent } from "./support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const box = (id: string, x = 10) => ({
	id,
	type: "rectangle",
	x,
	y: 10,
	width: 60,
	height: 40,
});

interface DoingEntry {
	doing: string;
	by: string;
	kind: "agent" | "human";
}

interface DoingEvent extends PaneEvent {
	type: "board_doing";
	board: string;
	doing?: DoingEntry;
	recent?: DoingEntry[];
}

const doingEvents = (events: PaneEvent[], start = 0): DoingEvent[] =>
	events.slice(start).filter((event): event is DoingEvent => event.type === "board_doing");

describe.serial("doing activity", () => {
	test("panes receive bounded board-scoped agent activity and no invented human activity", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-doing-activity-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault,
			env: { LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });

		const left = await openPaneSession(canvas.base, request, {
			clientId: "doing-left",
			x: 0,
			primary: true,
			focused: true,
		});
		resources.defer(() => left.close());
		const right = await openPaneSession(canvas.base, request, {
			clientId: "doing-right",
			x: 640,
		});
		resources.defer(() => right.close());
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: left.clientId },
			doing: false,
		});
		await left.register("payments");
		const leftStart = left.mark();
		const rightStart = right.mark();

		await request("/api/elements?board=payments", {
			method: "POST",
			doing: "rerouting orders through it",
			body: box("queue", 200),
		});
		const news = (await left.waitFor("board_doing", leftStart)) as DoingEvent | undefined;
		expect(news).toBeDefined();
		expect(news).toMatchObject({
			type: "board_doing",
			board: "payments",
			doing: { doing: "rerouting orders through it", kind: "agent" },
		});
		expect(news?.doing?.by.length).toBeGreaterThan(0);
		expect(news?.recent?.at(-1)?.doing).toBe("rerouting orders through it");
		const otherBoardNews = (await right.waitFor("board_doing", rightStart)) as
			| DoingEvent
			| undefined;
		expect(otherBoardNews?.board).toBe("payments");

		const afterSuccess = left.mark();
		const refusedLine = "updating a box that is gone";
		const refused = await request("/api/elements/xxx-not-here?board=payments", {
			method: "PUT",
			doing: refusedLine,
			body: { x: 1 },
		});
		expect(refused.status).toBe(404);
		await sleep(TEST_PANE_SOCKET_SETTLE_MS * 2);
		expect(
			doingEvents(left.events, afterSuccess).some((event) => event.doing?.doing === refusedLine),
		).toBeFalse();

		const humanStart = left.mark();
		const human = await request("/api/elements/changes?board=payments", {
			method: "POST",
			doing: false,
			body: {
				clientId: left.clientId,
				upserts: [{ ...box("human", 300), type: "ellipse" }],
				deletes: [],
			},
		});
		expect(human.status).toBe(200);
		await sleep(TEST_PANE_SOCKET_SETTLE_MS * 2);
		expect(doingEvents(left.events, humanStart)).toHaveLength(0);

		for (let index = 0; index < 7; index += 1) {
			const start = left.mark();
			await request("/api/elements?board=payments", {
				method: "POST",
				doing: `step ${index}`,
				body: box(`step-${index}`, 400 + index * 20),
			});
			expect(await left.waitFor("board_doing", start)).toBeDefined();
		}
		const recent = doingEvents(left.events).at(-1)?.recent ?? [];
		expect(recent.map((entry) => entry.doing)).toEqual([
			"step 2",
			"step 3",
			"step 4",
			"step 5",
			"step 6",
		]);

		const repeatedLine = "restoring the payment path from the export";
		for (let index = 0; index < 3; index += 1) {
			const start = left.mark();
			await request("/api/elements?board=payments", {
				method: "POST",
				doing: repeatedLine,
				body: box(`repeat-${index}`, 600 + index * 20),
			});
			expect(await left.waitFor("board_doing", start)).toBeDefined();
		}
		const repeated = doingEvents(left.events).at(-1)?.recent ?? [];
		expect(repeated.filter((entry) => entry.doing === repeatedLine)).toHaveLength(1);
		expect(repeated.at(-1)?.doing).toBe(repeatedLine);

		const late = await openPaneSession(canvas.base, request, {
			clientId: "doing-late",
			x: 0,
		});
		resources.defer(() => late.close());
		const lateStart = late.mark();
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "payments", pane: late.clientId },
			doing: false,
		});
		await late.register("payments");
		const replay = (await late.waitFor("board_doing", lateStart)) as DoingEvent | undefined;
		expect(replay?.recent).toHaveLength(5);
		expect(replay?.recent?.at(-1)?.doing).toBe(repeatedLine);

		const saved = await request<{ file?: string }>("/api/boards/save?board=payments", {
			method: "POST",
			doing: "writing the board down",
			body: {},
		});
		expect(saved.status).toBe(200);
		expect(saved.body.file).toBe(join(vault, "payments.excalidraw.md"));
		const bytes = readFileSync(saved.body.file!, "utf8");
		expect(bytes).not.toContain("rerouting orders through it");
		expect(bytes).not.toContain("writing the board down");
		expect(bytes).not.toMatch(/doing/);
		expect(bytes).toContain('"id": "queue"');
		const elements = await request<{ elements?: Array<Record<string, unknown>> }>(
			"/api/elements?board=payments",
		);
		expect(JSON.stringify(elements.body.elements)).not.toContain("rerouting orders through it");
	}, 30_000);
});
