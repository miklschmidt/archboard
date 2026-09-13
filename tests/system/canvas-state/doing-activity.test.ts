import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent } from "./support/pane-session.ts";

// What the person at the board sees while an agent works (TASK-095, ADR 0022):
// the step it said it was taking, bounded and deduplicated, replayed to a pane
// that arrives part way through — and beside it the boardless account the
// navigator reads, which can never disagree because both ride the same
// announcement. None of it is board content: the lines live in the running
// canvas and the file on disk never hears about them (ADR 0023).

const repoRoot = resolve(import.meta.dir, "../../..");

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

interface ActivityEvent extends PaneEvent {
	type: "agent_activity";
	activity: Array<{ board: string; claim: unknown; doing: DoingEntry | null }>;
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

		/**
		 * One agent edit to the board, stating its step.
		 * @param doing The line the writer is working under.
		 * @param node The node it adds.
		 * @param version The version it was written against.
		 * @returns The version afterwards.
		 */
		const edit = async (doing: string, node: string, version: number): Promise<number> => {
			const wrote = await request<{ version: number }>(
				`/api/semantic-boards/edit?expectVersion=${version}`,
				{
					method: "POST",
					doing,
					body: { board: "payments", edit: { nodes: [{ name: node, kind: "service" }] } },
				},
			);
			expect(wrote.status).toBe(200);
			return wrote.body.version;
		};

		const created = await request<{ version: number }>("/api/semantic-boards/create", {
			method: "POST",
			doing: "starting the payment path",
			body: { board: "payments", create: { level: "system", nodes: [] } },
		});
		expect(created.status).toBe(200);
		await request("/api/semantic-boards/create", {
			method: "POST",
			doing: "starting the ledger",
			body: { board: "ledger", create: { level: "system", nodes: [] } },
		});
		let version = created.body.version;

		const left = await openPaneSession(canvas.base, request, {
			clientId: "doing-left",
			board: "payments",
			x: 0,
			primary: true,
			focused: true,
		});
		resources.defer(() => left.close());
		const right = await openPaneSession(canvas.base, request, {
			clientId: "doing-right",
			board: "ledger",
			x: 640,
		});
		resources.defer(() => right.close());
		const leftStart = left.mark();
		const rightStart = right.mark();

		version = await edit("rerouting orders through it", "Queue", version);
		const news = (await left.waitFor("board_doing", leftStart)) as DoingEvent | undefined;
		expect(news).toMatchObject({
			type: "board_doing",
			board: "payments",
			doing: { doing: "rerouting orders through it", kind: "agent" },
		});
		expect(news?.doing?.by.length).toBeGreaterThan(0);
		expect(news?.recent?.at(-1)?.doing).toBe("rerouting orders through it");

		// Every board message names the board it is about, so the pane showing the
		// ledger can tell that this step was not about what it is showing.
		const otherBoardNews = (await right.waitFor("board_doing", rightStart)) as
			| DoingEvent
			| undefined;
		expect(otherBoardNews?.board).toBe("payments");
		expect(
			doingEvents(right.events, rightStart).every((event) => event.board === "payments"),
		).toBeTrue();
		// It does hear which board an agent is on, whatever it is showing (ADR
		// 0022): a snapshot on connect naming every board that has been worked on,
		// and again as the unclaimed write lands.
		const snapshot = right.events.find((event) => event.type === "agent_activity") as
			| ActivityEvent
			| undefined;
		expect(snapshot?.activity.map((entry) => entry.board).toSorted()).toEqual([
			"ledger",
			"payments",
		]);
		const activity = (await right.waitFor("agent_activity", rightStart)) as
			| ActivityEvent
			| undefined;
		expect(activity?.activity).toContainEqual(
			expect.objectContaining({
				board: "payments",
				claim: null,
				doing: expect.objectContaining({ doing: "rerouting orders through it", kind: "agent" }),
			}),
		);

		// A write that was refused said nothing, because it did nothing.
		const afterSuccess = left.mark();
		const refusedLine = "editing a board that is not there";
		const refused = await request("/api/semantic-boards/edit?expectVersion=1", {
			method: "POST",
			doing: refusedLine,
			body: { board: "not-here", edit: { nodes: [{ name: "Ghost", kind: "service" }] } },
		});
		expect(refused.status).not.toBe(200);
		await left.sync();
		expect(
			doingEvents(left.events, afterSuccess).some((event) => event.doing?.doing === refusedLine),
		).toBeFalse();

		// A read is not work: drawing the board announces nothing.
		const readStart = left.mark();
		expect((await request("/api/semantic-boards/board?board=payments")).status).toBe(200);
		await left.sync();
		expect(doingEvents(left.events, readStart)).toHaveLength(0);

		// A claim is activity for as long as it stands, and its end is news too.
		const claimStart = right.mark();
		await request("/api/semantic-boards/claim?board=payments", {
			method: "POST",
			doing: false,
			body: { reason: "redrawing the payment path" },
		});
		const claimed = (await right.waitFor("agent_activity", claimStart)) as
			| ActivityEvent
			| undefined;
		expect(claimed?.activity).toContainEqual(
			expect.objectContaining({
				board: "payments",
				claim: expect.objectContaining({ claimed: true, reason: "redrawing the payment path" }),
			}),
		);
		const releaseStart = right.mark();
		await request("/api/semantic-boards/claim/release?board=payments", {
			method: "POST",
			doing: false,
		});
		const released = (await right.waitFor("agent_activity", releaseStart)) as
			| ActivityEvent
			| undefined;
		expect(released?.activity.every((entry) => entry.claim === null)).toBeTrue();

		// The list is bounded: the last five, not everything that ever happened.
		for (let index = 0; index < 7; index += 1) {
			const start = left.mark();
			version = await edit(`step ${index}`, `Step ${index}`, version);
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

		// One intent said three times running is one line, not three.
		const repeatedLine = "restoring the payment path from the export";
		for (let index = 0; index < 3; index += 1) {
			const start = left.mark();
			version = await edit(repeatedLine, `Repeat ${index}`, version);
			expect(await left.waitFor("board_doing", start)).toBeDefined();
		}
		const repeated = doingEvents(left.events).at(-1)?.recent ?? [];
		expect(repeated.filter((entry) => entry.doing === repeatedLine)).toHaveLength(1);
		expect(repeated.at(-1)?.doing).toBe(repeatedLine);

		// A pane arriving part way through is told the story so far rather than
		// sitting blank until the next write.
		const late = await openPaneSession(canvas.base, request, {
			clientId: "doing-late",
			board: "payments",
			x: 0,
		});
		resources.defer(() => late.close());
		const replay = await waitFor(
			() => doingEvents(late.events).find((event) => event.board === "payments"),
			"the arriving pane to be told what has happened on payments",
		);
		expect(replay?.recent).toHaveLength(5);
		expect(replay?.recent?.at(-1)?.doing).toBe(repeatedLine);

		// And none of it is on the board. The lines are what a running canvas
		// knows about an agent at work, and the file is the architecture.
		const bytes = readFileSync(join(vault, "payments.semantic.json"), "utf8");
		expect(bytes).not.toContain("rerouting orders through it");
		expect(bytes).not.toContain(repeatedLine);
		expect(bytes).not.toMatch(/doing/);
		expect(bytes).toContain('"name": "Queue"');
	}, 30_000);
});
