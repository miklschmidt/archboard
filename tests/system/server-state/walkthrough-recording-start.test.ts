// Starting voice for a recorded walkthrough, through the real gateway, pane routes and Codex
// session (TASK-304).
//
// What is guarded: a recording start opens no step itself, because the recording page opens step
// 1 and moves on by itself; the page's own move to step 1, reported with no request behind it,
// reaches the voice model as speech the way a step chosen by hand does; the voice projection
// says the live session is unattended; the recording page's pane hears its own steps by client
// id and is neither listed nor shown a board by a show that names no pane; and the recording is a
// tab session of its own (TASK-373), so another tab talks at the same time, each on its own
// coordinator, and neither stops the other.

import { expect, test } from "bun:test";
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
import { createRequester, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@archboard/board/pane-context";
import { productionServer } from "./support/production-server.ts";

/** As much of a board as this test reads back. */
interface SemanticBoardReply {
	version: number;
	variants: Array<{ content: { walkthroughs: Array<{ id: string }> } }>;
}

const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");
const CLIENT = "record-client";
const PANE = "record-pane";
const BOARD = "tour";

test("a recording opens no step, hands the page's own first step to the voice, and talks at once with another tab, each on its own coordinator", async () => {
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
		const socket = await openApplicationSocket(server.base, CLIENT, {
			tabSession: "recording-tab",
		});
		resources.defer(() => socket.close());
		const paneMessages: string[] = [];
		socket.socket.on("message", (raw) => {
			const message = JSON.parse(String(raw)) as { type?: unknown };
			if (typeof message.type === "string") paneMessages.push(message.type);
		});
		expect(
			(
				await request("/api/semantic-boards/create", {
					method: "POST",
					doing: "starting the board a recording presents",
					body: {
						board: BOARD,
						create: {
							level: "system",
							nodes: [{ name: "Gateway", kind: "service" }],
							walkthroughs: [
								{
									name: "How a request lands",
									beats: [
										{ heading: "The front door", body: "Every request enters at the gateway." },
										{ heading: "One writer", body: "The gateway owns every write." },
									],
								},
							],
						},
					},
				})
			).status,
		).toBe(200);
		const read = await request<{ board: SemanticBoardReply }>(
			`/api/semantic-boards/board?board=${BOARD}`,
		);
		const walkthrough = read.body.board.variants[0]?.content.walkthroughs[0]?.id ?? "";
		expect(walkthrough).not.toBe("");
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...pane(CLIENT, PANE, true, true), board: BOARD, recording: true },
				})
			).status,
		).toBe(200);
		let sequence = 0;
		const report = async (presentation: Record<string, unknown> | null): Promise<void> => {
			const reported = await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
				method: "POST",
				doing: false,
				body: {
					paneId: PANE,
					clientId: CLIENT,
					board: { name: BOARD, key: BOARD },
					variant: null,
					view: null,
					selection: [],
					version: read.body.board.version,
					presentation,
					at: new Date().toISOString(),
					sequence: sequence++,
				},
			});
			expect(reported.status).toBe(200);
		};
		await report(null);
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
		const startRecording = () =>
			command("realtimeStart", {
				threadId: link["threadId"],
				sdp: "v=0",
				narrative: { walkthrough, recording: { language: "en" } },
			});
		const frames = (method: string) =>
			records(fixture.logPath).filter((entry) => entry.kind === "frame" && entry.method === method);
		const spoken = (): string[] =>
			frames("thread/realtime/appendSpeech")
				.map((entry) => entry.params?.["text"])
				.filter((text): text is string => typeof text === "string");

		const voice = async () =>
			snapshots(await socket.request("snapshot"))["voice"] as Record<string, unknown>;
		expect((await voice())["unattended"]).toBe(false);
		expect(await startRecording()).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		expect((await voice())["unattended"]).toBe(true);
		expect(frames("thread/realtime/start")).toHaveLength(1);
		// Nothing asks the pane for a step, and nothing is said before the page moves. A step the
		// start asked for would be sent down this socket before the start's own answer.
		expect(paneMessages).not.toContain("pane_present");
		expect(spoken()).toHaveLength(0);

		// The recording page opens step 1 itself: a position no request put there.
		await report({ walkthrough, beat: 0, of: 2, arrived: true, answering: null });
		await waitFor(() => spoken().length === 1, "the page's first step to reach the voice", {
			timeoutMs: 2000,
		});
		expect(spoken()[0]).toContain("The front door");

		// Somebody talks in another tab while the recording runs: that tab starts its own
		// conversation, and its voice runs on its own coordinator beside the recording's.
		const talker = await openApplicationSocket(server.base, "talking-client", {
			tabSession: "talking-tab",
		});
		resources.defer(() => talker.close());
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: pane("talking-client", "A", true, true),
				})
			).status,
		).toBe(200);
		expect(await talker.request("connect")).toMatchObject({ ok: true });
		const talk = async (name: string, extra: Record<string, unknown> = {}) =>
			talker.request("command", {
				command: {
					kind: "browser_command",
					command: name,
					...leaseTarget(await talker.request("claimLease")),
					...extra,
				},
			});
		expect(await talk("threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const talking = snapshots(await talker.request("snapshot"))["threadLink"] as Record<
			string,
			unknown
		>;
		expect(await talker.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		expect(
			await talk("realtimeStart", { threadId: talking["threadId"], sdp: "v=0" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const voiced = frames("thread/realtime/start").map((entry) => entry.params?.["threadId"]);
		expect(voiced).toHaveLength(2);
		expect(voiced[0]).not.toBe(voiced[1]);
		expect(frames("thread/realtime/stop")).toHaveLength(0);
		expect((await voice())["unattended"]).toBe(true);
		const talkingVoice = snapshots(await talker.request("snapshot"))["voice"] as Record<
			string,
			unknown
		>;
		expect(talkingVoice["unattended"]).toBe(false);
		expect(paneMessages).not.toContain("pane_present");

		// Nobody can point at the recording page's pane: it is not listed, and a show that names no
		// pane finds no browser rather than moving the recording.
		await talker.close();
		await waitFor(async () => {
			const listed = await request<{ paneCount: number }>("/api/panes");
			return listed.body.paneCount === 0;
		}, "the talking tab's pane to leave, leaving only the recording's unlisted pane");
		const shown = await request("/api/panes/show", {
			method: "POST",
			doing: false,
			body: { board: BOARD },
		});
		expect(shown.status).toBe(503);
		expect(paneMessages).not.toContain("pane_board");
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);
