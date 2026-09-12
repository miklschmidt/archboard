import { expect, test } from "bun:test";
import { join } from "node:path";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester, sleep, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@/shared/semantic-pane-context";

/** As much of a board as this test reads back. */
interface SemanticBoardReply {
	version: number;
	variants: Array<{
		id: string;
		name: string;
		lifecycle: string;
		content: { nodes: Array<{ id: string }> };
	}>;
}
const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

test("live voice receives selection and board switches from production pane routes", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const socket = await openApplicationSocket(canvas.base, "voice-client");
		resources.defer(() => socket.close());
		expect(
			(
				await request("/api/semantic-boards/create", {
					method: "POST",
					doing: "starting the board this pane shows",
					body: { board: "scratch", create: { nodes: [{ name: "Gateway", kind: "service" }] } },
				})
			).status,
		).toBe(200);
		const registration = pane("voice-client", "voice-pane", true, true);
		expect(
			(await request("/api/panes", { method: "POST", doing: false, body: registration })).status,
		).toBe(200);
		expect(await socket.request("connect")).toMatchObject({ ok: true });
		const command = async (name: string, extra: Record<string, unknown> = {}) =>
			socket.request("command", {
				command: {
					kind: "browser_command",
					command: name,
					...leaseTarget(await socket.request("claimLease")),
					...extra,
				},
			});
		expect(await command("threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const link = snapshots(await socket.request("snapshot"))["threadLink"] as Record<
			string,
			unknown
		>;
		expect(await socket.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		expect(
			await command("realtimeStart", { threadId: link["threadId"], sdp: "v=0" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const updates = () =>
			records(fixture.logPath)
				.filter((entry) => entry.method === "thread/realtime/appendText")
				.flatMap((entry) => {
					const text = entry.params?.["text"];
					if (typeof text !== "string" || !text.startsWith("{")) return [];
					const callback = JSON.parse(text);
					return callback.semantic ? [JSON.parse(callback.semantic.brief)] : [];
				});
		// What the person picked out, in the board's own words: the id an edit
		// command would take, never anything drawn (ADR 0023).
		const read = await request<{ board: SemanticBoardReply }>(
			"/api/semantic-boards/board?board=scratch",
		);
		expect(read.status).toBe(200);
		const variant = read.body.board.variants[0]!;
		const ids = [variant.content.nodes[0]!.id];
		expect(
			(
				await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
					method: "POST",
					doing: false,
					body: {
						paneId: "voice-pane",
						clientId: "voice-client",
						board: { name: "scratch", key: "scratch" },
						variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
						view: null,
						selection: ids.map((id) => ({ id })),
						version: read.body.board.version,
						at: new Date().toISOString(),
						sequence: 0,
					},
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.architecture.selection.subjects[0]?.id === ids[0]),
			"what the person picked out to reach live voice",
			{ timeoutMs: 2000 },
		);
		expect(updates().at(-1)).toMatchObject({
			board: { key: "scratch" },
			pane: { paneId: "voice-pane" },
			// How many were picked out, and which — a count alone would not say
			// whether the ids an edit command takes ever arrived.
			architecture: { selection: { count: ids.length } },
		});
		expect(
			updates()
				.at(-1)
				?.architecture.selection.subjects.map((one: { id: string }) => one.id),
		).toEqual(ids);
		// And a pane that has said what it is reading is read out by the variant's
		// lasting name rather than its id: "scratch (Initial)" is something an
		// agent can say to somebody, and an id twice over is not.
		const named = await request<{ summary: string }>("/api/panes");
		expect(named.body.summary).toContain("scratch (Initial)");
		expect(
			(
				await request("/api/semantic-boards/create", {
					method: "POST",
					doing: "starting the board this pane moves to",
					body: { board: "payments", create: { nodes: [{ name: "Ledger", kind: "datastore" }] } },
				})
			).status,
		).toBe(200);
		expect(
			(
				await request("/api/panes/show", {
					method: "POST",
					doing: false,
					body: { board: "payments", pane: "primary" },
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.board.key === "payments"),
			"switched board to reach live voice",
			{ timeoutMs: 2000 },
		);
		// And the pane says what it is reading now, counting up from its last
		// report so the reader can tell this one came after it.
		expect(
			(
				await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
					method: "POST",
					doing: false,
					body: {
						paneId: "voice-pane",
						clientId: "voice-client",
						board: { name: "payments", key: "payments" },
						variant: null,
						view: null,
						selection: [],
						version: null,
						at: new Date().toISOString(),
						sequence: 1,
					},
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().at(-1)?.architecture.selection.count === 0,
			"the pane's new reading to reach live voice",
			{ timeoutMs: 2000 },
		);
		expect(updates().at(-1)).toMatchObject({
			board: { key: "payments" },
			architecture: { selection: { count: 0, subjects: [] } },
		});

		// A report overtaken by its own successor is dropped, and — the half only
		// this side can see — the coordinator is never handed it either. Two
		// reports from one pane can be in flight at once, and announcing the loser
		// would put the reading the ordering just rejected in front of every agent.
		const overtaken = await request<{ kept: boolean }>(SEMANTIC_PANE_CONTEXT_ROUTE, {
			method: "POST",
			doing: false,
			body: {
				paneId: "voice-pane",
				clientId: "voice-client",
				board: { name: "scratch", key: "scratch" },
				variant: null,
				view: null,
				selection: ids.map((id) => ({ id })),
				version: null,
				at: new Date().toISOString(),
				sequence: 0,
			},
		});
		// Answered, not failed: an overtaken request in flight is not an error.
		expect(overtaken.status).toBe(200);
		expect(overtaken.body.kept).toBeFalse();
		const beforeStale = updates().length;
		await sleep(300);
		// What the loser said never reaches the coordinator: not the board it
		// named, and not what it said was picked out on it. Saying "no brief at
		// all" would be asserting something else — a brief repeating the reading
		// that WON is the pane's own truth said twice, which costs nothing and is
		// not what this is about.
		for (const brief of updates().slice(beforeStale)) {
			expect(brief).toMatchObject({
				board: { key: "payments" },
				architecture: { selection: { count: 0, subjects: [] } },
			});
		}
		expect(updates().at(-1)).toMatchObject({
			board: { key: "payments" },
			architecture: { selection: { count: 0, subjects: [] } },
		});
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...registration, board: "payments", focused: false },
				})
			).status,
		).toBe(200);
		await waitFor(
			() => updates().some((brief) => brief.pane.focused === false),
			"pane focus to reach live voice",
			{ timeoutMs: 2000 },
		);
	} finally {
		await resources.disposeAsync();
	}
}, 15000);
