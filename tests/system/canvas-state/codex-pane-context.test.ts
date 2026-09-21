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
import { createRequester, sleep } from "./support/http.ts";
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
// Long enough for a callback to be delivered: the old appends arrived well inside it.
const PANE_TELEMETRY_SETTLE_MS = 600;
const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

// While voice is live a pane still reports what it is reading, and the server still orders those
// reports, but none of it is appended to the voice session. Appending it was a feedback loop: a
// presented walkthrough step changes the selection, which fed the voice model a machine envelope
// as it began each step. TASK-293 brings back the person's own actions, as one spoken sentence.
test("live voice is appended nothing of what production pane routes report", async () => {
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
					body: {
						board: "scratch",
						create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] },
					},
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
		// The control for the absence asserted below: this log is where an append would show.
		expect(records(fixture.logPath).some((entry) => entry.method === "thread/realtime/start")).toBe(
			true,
		);
		const semanticAppends = () =>
			records(fixture.logPath)
				.filter((entry) => entry.method === "thread/realtime/appendText")
				.filter((entry) => {
					const text = entry.params?.["text"];
					if (typeof text !== "string" || !text.startsWith("{")) return false;
					return "semantic" in JSON.parse(text);
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
		// A pane that has said what it is reading is read out by the variant's
		// lasting name rather than its id: "scratch (Initial)" is something an
		// agent can say to somebody, and an id twice over is not.
		const named = await request<{ summary: string }>("/api/panes");
		expect(named.body.summary).toContain("scratch (Initial)");
		expect(
			(
				await request("/api/semantic-boards/create", {
					method: "POST",
					doing: "starting the board this pane moves to",
					body: {
						board: "payments",
						create: { level: "system", nodes: [{ name: "Ledger", kind: "datastore" }] },
					},
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

		// A report overtaken by its own successor is dropped. Two reports from one
		// pane can be in flight at once, and keeping the loser would put the reading
		// the ordering just rejected in front of every agent.
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
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...registration, board: "payments", focused: false },
				})
			).status,
		).toBe(200);
		// A selection, a board switch, a new reading and a focus change have all been reported by
		// now; an append used to follow each within a few hundred milliseconds.
		await sleep(PANE_TELEMETRY_SETTLE_MS);
		expect(semanticAppends()).toEqual([]);
	} finally {
		await resources.disposeAsync();
	}
}, 15000);
