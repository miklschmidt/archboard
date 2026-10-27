import { seedCanonicalFixture, canonicalCapture } from "../support/canonical-fixture.ts";
import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester, sleep, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@archboard/board/pane-context";
import { productionServer } from "./support/production-server.ts";

// Long enough for a callback to be delivered: the old appends arrived well inside it.
const PANE_TELEMETRY_SETTLE_MS = 600;
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

// While voice is live a pane reports what it is reading and the server orders those reports. What
// the pane marks as the user's own doing reaches the voice session as pane news, one sentence of
// names; everything else reaches nobody (TASK-293, ADR 0034). Appending every report was a
// feedback loop: a presented walkthrough step changes the reading, which fed the voice model a
// machine envelope as it began each step, and it answered.
test("live voice is told what the user changed by hand in its own tab, and nothing of what anybody else did", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const server = await startOwnedServer({
			...productionServer,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => server.dispose());
		const request = createRequester(server);
		const socket = await openApplicationSocket(server.base, "voice-client");
		resources.defer(() => socket.close());
		const model = seedCanonicalFixture(fixture.vault, "scratch", [
			{ name: "Gateway", kind: "service" },
			{ name: "Ledger", kind: "datastore" },
		]);
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
		const appended = (): string[] =>
			records(fixture.logPath)
				.filter((entry) => entry.method === "thread/realtime/appendText")
				// The log holds the answer to each request under the same method, with no text.
				.map((entry) => entry.params?.["text"])
				.filter((text): text is string => typeof text === "string")
				// The board catalogue is appended by its own channel when a board is created.
				.filter((text) => !text.includes("archboard_board_catalogue"));
		// What the person picked out, in the board's own words: the id an edit
		// command would take, never anything drawn (ADR 0023).
		const variant = model.selectedState!;
		const ids = [model.modules.find((module) => module.name === "Gateway")!.id];
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
						version: null,
						architecture: canonicalCapture(fixture.vault, model, ids),
						// The pane says the pick was the user's own hand.
						byUser: ["selection"],
						at: new Date().toISOString(),
						sequence: 0,
					},
				})
			).status,
		).toBe(200);
		// The pick reaches live voice as a sentence that names the board and the subject. An id or
		// a line of JSON in a speech model's context is something it says out loud.
		await waitFor(() => appended().length === 1, "the user's pick to reach live voice", {
			timeoutMs: 2000,
		});
		expect(appended()[0]).toContain("Gateway");
		expect(appended()[0]).toContain("scratch");
		expect(appended()[0]).not.toContain(ids[0]!);
		expect(appended()[0]).not.toContain("{");
		// A handoff turn is Codex's, so the coordinator is never given this pick. Its one live read
		// of the selection is `browser panes`, which must already hold what the pane just reported
		// (TASK-318): the coordinator's instructions send it there for every "this".
		const live = await request<{
			panes: Array<{ clientId: string; reading: { selection: Array<{ id: string }> } }>;
		}>("/api/panes");
		expect(
			live.body.panes
				.find((entry) => entry.clientId === "voice-client")
				?.reading.selection.map((subject) => subject.id),
		).toEqual(ids);
		// A pick by hand in another browser tab is that tab's conversation's news, never this
		// voice's (TASK-373): every tab has a publisher of its own.
		const otherTab = await openApplicationSocket(server.base, "other-tab-client", {
			tabSession: "other-tab",
		});
		resources.defer(() => otherTab.close());
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: pane("other-tab-client", "voice-pane", false, false),
				})
			).status,
		).toBe(200);
		expect(
			(
				await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
					method: "POST",
					doing: false,
					body: {
						paneId: "voice-pane",
						clientId: "other-tab-client",
						board: { name: "scratch", key: "scratch" },
						variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
						view: null,
						selection: ids.map((id) => ({ id })),
						version: null,
						architecture: canonicalCapture(fixture.vault, model, ids),
						byUser: ["selection"],
						at: new Date().toISOString(),
						sequence: 0,
					},
				})
			).status,
		).toBe(200);
		await sleep(PANE_TELEMETRY_SETTLE_MS);
		expect(appended()).toHaveLength(1);
		await otherTab.close();
		// A pane that has said what it is reading is read out by the variant's
		// lasting name rather than its id: "scratch (Initial)" is something an
		// agent can say to somebody, and an id twice over is not.
		const named = await request<{ summary: string }>("/api/panes");
		expect(typeof named.body.summary).toBe("string");

		expect(
			(
				await request("/api/panes/show", {
					method: "POST",
					doing: false,
					body: {
						reading: {
							model: "Fixture",
							module: model.modules.find((module) => module.name === "Ledger")!.id,
						},
						pane: "primary",
					},
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
		// Which pane the user is in moves only by their own hand, so that is news too. A show that
		// names no agent (the page's own, which the pane marks itself), a write to a board no pane
		// showed when it landed, and the two readings no hand was marked on, are not: an append
		// used to follow each of them within a few hundred milliseconds. An agent's show is
		// codex-outside-change's.
		await waitFor(() => appended().length === 2, "the user's move to reach live voice", {
			timeoutMs: 2000,
		});
		await sleep(PANE_TELEMETRY_SETTLE_MS);
		expect(appended()).toHaveLength(2);
		expect(appended()[1]).toContain(model.manifest.name);
		expect(appended()[1]).not.toContain("{");
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);

// Every browser tab presents a pane "A" of its own, so a command's context is read from the exact
// pane that sent it, by client id (TASK-373). A lookup by "A" took the first tab's pane, and a turn
// typed in one tab carried the board another tab was showing.
test("a command's context is its own pane's while another tab also shows pane A", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const server = await startOwnedServer({
			...productionServer,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => server.dispose());
		const request = createRequester(server);
		seedCanonicalFixture(fixture.vault, "scratch", [
			{ name: "Gateway", kind: "service" },
			{ name: "Ledger", kind: "service" },
		]);
		// The other tab's pane A registers first and shows another board.
		const other = await openApplicationSocket(server.base, "other-tab-a", {
			tabSession: "other-tab",
		});
		resources.defer(() => other.close());
		const registerOther = await request("/api/panes", {
			method: "POST",
			doing: false,
			body: { ...pane("other-tab-a", "A", true, true), board: "payments" },
		});
		expect(registerOther.status).toBe(200);
		const own = await openApplicationSocket(server.base, "own-tab-a", { tabSession: "own-tab" });
		resources.defer(() => own.close());
		const registerOwn = await request("/api/panes", {
			method: "POST",
			doing: false,
			body: pane("own-tab-a", "A", true, true),
		});
		expect(registerOwn.status).toBe(200);
		expect(await own.request("connect")).toMatchObject({ ok: true });
		const command = async (name: string, extra: Record<string, unknown> = {}) =>
			own.request("command", {
				command: {
					kind: "browser_command",
					command: name,
					...leaseTarget(await own.request("claimLease")),
					...extra,
				},
			});
		expect(await command("threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const link = snapshots(await own.request("snapshot"))["threadLink"] as Record<string, unknown>;
		expect(
			await command("start", { threadId: link["threadId"], prompt: "What does this board say?" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const turn = records(fixture.logPath).find(
			(entry) => entry.kind === "frame" && entry.method === "turn/start",
		);
		const additional = turn?.params?.["additionalContext"] as
			| { readonly archboard?: { readonly value?: unknown } }
			| undefined;
		const context = JSON.parse(String(additional?.archboard?.value)) as {
			readonly paneId: string;
			readonly board: { readonly name: string };
			readonly semantic: { readonly brief: string };
		};
		expect(context).toMatchObject({ paneId: "A", board: { name: "scratch" } });
		// The brief names the board's vault, so the thread can pass it as -C (ADR 0050).
		expect(JSON.parse(context.semantic.brief)).toMatchObject({
			board: { vault: realpathSync(fixture.vault) },
		});
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);
