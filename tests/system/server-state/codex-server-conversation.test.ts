import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { startOwnedServer } from "../support/owned-server.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
	type ApplicationSocket,
} from "./support/codex-production.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@/shared/semantic-pane-context";

const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

/**
 * Claim the lease on one pane's socket and send one command under it.
 * @param socket The pane's socket.
 * @param command The command name.
 * @param extra The command's own fields.
 * @returns The result and the lease it ran under.
 */
async function leased(
	socket: ApplicationSocket,
	command: string,
	extra: Record<string, unknown> = {},
) {
	const lease = await socket.request("claimLease");
	const result = await socket.request("command", {
		command: { kind: "browser_command", command, ...leaseTarget(lease), ...extra },
	});
	return { lease, result };
}

/**
 * The thread link a pane's snapshot shows.
 * @param socket The pane's socket.
 * @returns The link.
 */
async function linkOf(socket: ApplicationSocket): Promise<Record<string, unknown>> {
	return snapshots(await socket.request("snapshot"))["threadLink"] as Record<string, unknown>;
}

/**
 * The latest turn a pane's timeline shows as finished.
 * @param socket The pane's socket.
 * @returns Its id, or undefined while the latest turn has not finished.
 */
async function finishedTurn(socket: ApplicationSocket): Promise<string | undefined> {
	const timeline = snapshots(await socket.request("snapshot"))["timeline"] as {
		readonly turns: readonly { readonly turnId: string; readonly status: string }[];
	} | null;
	const latest = timeline?.turns.at(-1);
	return latest?.status === "completed" ? latest.turnId : undefined;
}

// One conversation per canvas, whichever pane speaks (TASK-302.06): the link
// lives on the canvas, a turn carries the board of the pane that sent it, and
// closing the pane that created the link strands nothing.
test("two panes share one conversation that outlives the pane that created it", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const canvas = await startOwnedServer({
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
		for (const [board, node] of [
			["scratch", "Gateway"],
			["payments", "Ledger"],
		] as const) {
			const created = await request("/api/semantic-boards/create", {
				method: "POST",
				doing: `starting ${board}`,
				body: { board, create: { level: "system", nodes: [{ name: node, kind: "service" }] } },
			});
			expect(created.status).toBe(200);
		}
		const registerA = async () =>
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: pane("client-a", "A", false, true),
				})
			).status;
		// A is first in reading order and not focused; B is focused and reads another board.
		const a = await openApplicationSocket(canvas.base, "client-a");
		resources.defer(() => a.close());
		const b = await openApplicationSocket(canvas.base, "client-b");
		resources.defer(() => b.close());
		expect(await registerA()).toBe(200);
		const registerB = await request("/api/panes", {
			method: "POST",
			doing: false,
			body: { ...pane("client-b", "B", true, false), board: "payments" },
		});
		expect(registerB.status).toBe(200);
		expect(await a.request("connect")).toMatchObject({ ok: true });
		expect(await b.request("connect")).toMatchObject({ ok: true });

		// A creates the link; B, which linked nothing, reads the same one.
		expect((await leased(a, "threadLinkCreate")).result).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const created = await linkOf(a);
		expect(created).toMatchObject({ state: "executable" });
		expect(await linkOf(b)).toEqual(created);

		// B's typed turn runs on that thread and carries B's board.
		const started = await leased(b, "start", {
			threadId: created["threadId"],
			prompt: "Talk from the other pane.",
		});
		expect(started.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const turn = records(fixture.logPath).find(
			(entry) => entry.kind === "frame" && entry.method === "turn/start",
		);
		const additional = turn?.params?.["additionalContext"] as
			| { readonly archboard?: { readonly value?: unknown } }
			| undefined;
		const context = JSON.parse(String(additional?.archboard?.value)) as {
			readonly paneId: string;
			readonly board: { readonly name: string };
		};
		expect(context).toMatchObject({ paneId: "B", board: { name: "payments" } });

		const pending = await waitFor(async () => {
			const snapshot = snapshots(await b.request("snapshot"));
			const approvals = snapshot["approvals"] as Record<string, unknown>[];
			const dynamicApprovals = snapshot["dynamicApprovals"] as Record<string, unknown>[];
			return approvals.length === 1 && dynamicApprovals.length === 1
				? { ordinary: approvals[0]! }
				: undefined;
		}, "both approvals to reach pane B");
		if (pending === undefined) throw new Error("The approvals disappeared.");

		// The pane that created the link closes.
		await a.close();
		await waitFor(async () => {
			const listed = await request<{ paneCount: number }>("/api/panes");
			return listed.body.paneCount === 1;
		}, "pane A to leave the canvas");

		// B answers both approvals: neither was cancelled with A, and the
		// coordination approval follows B's lease.
		const answered = await leased(b, "approvalRespond", {
			requestId: pending.ordinary["requestId"],
			approvalId: pending.ordinary["approvalId"],
			response: { approvalKind: "command_execution", decision: "accept" },
		});
		expect(answered.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const dynamicLease = await b.request("claimLease");
		const rebound = (snapshots(await b.request("snapshot"))["dynamicApprovals"] as
			| Record<string, unknown>[]
			| undefined)![0]!;
		const dynamicAnswer = await b.request("command", {
			command: {
				kind: "browser_command",
				command: "dynamicApprovalRespond",
				...leaseTarget(dynamicLease),
				capturedLink: (rebound["binding"] as Record<string, unknown>)["capturedLink"],
				identity: rebound["identity"],
				effectHash: rebound["effectHash"],
				decision: "decline",
			},
		});
		expect(dynamicAnswer).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		await waitFor(
			() =>
				records(fixture.logPath).some(
					(entry) => entry.kind === "reverse_response" && entry.frame?.id === "ordinary-request-1",
				),
			"B's ordinary answer to reach Codex",
		);

		// B starts and stops voice on the conversation A created, while B's turn
		// still runs: the thread's status is not the one its link was bound with,
		// and that is no reason to stop telling the voice where the person looks
		// (TASK-302.07).
		expect(await finishedTurn(b)).toBeUndefined();
		expect(await b.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		const voice = await leased(b, "realtimeStart", { threadId: created["threadId"], sdp: "v=0" });
		expect(voice.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const handle = (voice.result.value as Record<string, unknown>)["realtimeSessionHandle"];
		// What the person picks by hand in B is news to that voice, though A made the link.
		const board = await request<{
			board: {
				version: number;
				variants: Array<{
					id: string;
					name: string;
					lifecycle: string;
					content: { nodes: Array<{ id: string }> };
				}>;
			};
		}>("/api/semantic-boards/board?board=payments");
		const variant = board.body.board.variants[0]!;
		const picked = await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
			method: "POST",
			doing: false,
			body: {
				paneId: "B",
				clientId: "client-b",
				board: { name: "payments", key: "payments" },
				variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
				view: null,
				selection: [{ id: variant.content.nodes[0]!.id }],
				version: board.body.board.version,
				byUser: ["selection"],
				at: new Date().toISOString(),
				sequence: 0,
			},
		});
		expect(picked.status).toBe(200);
		await waitFor(
			() =>
				records(fixture.logPath).some(
					(entry) =>
						entry.method === "thread/realtime/appendText" &&
						String(entry.params?.["text"]).includes("Ledger"),
				),
			"B's pick to reach live voice",
		);
		expect(
			(
				await leased(b, "realtimeStop", {
					threadId: created["threadId"],
					realtimeSessionHandle: handle,
				})
			).result,
		).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		expect(records(fixture.logPath).some((entry) => entry.kind === "realtime_stop")).toBeTrue();
		writeFileSync(fixture.controlPath, JSON.stringify({ completeWorkhorseTurn: true }));
		const first = await waitFor(() => finishedTurn(b), "the workhorse turn to finish");

		// And B still sends typed turns into it.
		const turnsBefore = records(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === "turn/start",
		).length;
		const sent = await leased(b, "start", {
			threadId: created["threadId"],
			prompt: "Still here after A closed.",
		});
		expect(sent.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		expect(
			records(fixture.logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "turn/start",
			).length,
		).toBe(turnsBefore + 1);
		await waitFor(async () => {
			const finished = await finishedTurn(b);
			return finished !== first ? finished : undefined;
		}, "the second workhorse turn to finish");

		// A pane reopened under A's old id is shown the canvas's link, and a
		// create from B replaces it for every pane.
		const reopened = await openApplicationSocket(canvas.base, "client-a");
		resources.defer(() => reopened.close());
		expect(await registerA()).toBe(200);
		expect(await reopened.request("connect")).toMatchObject({ ok: true });
		expect(await linkOf(reopened)).toEqual(await linkOf(b));
		expect((await leased(b, "threadLinkCreate")).result).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const replacement = await linkOf(b);
		expect(replacement).toMatchObject({ state: "executable" });
		expect(replacement["threadId"]).not.toBe(created["threadId"]);
		expect(await linkOf(reopened)).toEqual(replacement);
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
