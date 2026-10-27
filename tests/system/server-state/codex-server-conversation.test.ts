import { seedCanonicalFixture, canonicalCapture } from "../support/canonical-fixture.ts";
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
import { coordinatorModelFixture } from "./fixtures/fake-codex-production-data.ts";
import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@archboard/board/pane-context";
import { productionServer } from "./support/production-server.ts";

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
 * What a pane's snapshot shows.
 * @param socket The pane's socket.
 * @returns The snapshot.
 */
async function shown(socket: ApplicationSocket): Promise<Record<string, unknown>> {
	return snapshots(await socket.request("snapshot"));
}

/**
 * The thread link a pane's snapshot shows.
 * @param socket The pane's socket.
 * @returns The link.
 */
async function linkOf(socket: ApplicationSocket): Promise<Record<string, unknown>> {
	return (await shown(socket))["threadLink"] as Record<string, unknown>;
}

/**
 * The approvals of both kinds a pane's snapshot shows.
 * @param socket The pane's socket.
 * @returns Them.
 */
async function approvalsOf(socket: ApplicationSocket) {
	const snapshot = await shown(socket);
	return {
		ordinary: snapshot["approvals"] as Record<string, unknown>[],
		dynamic: snapshot["dynamicApprovals"] as Record<string, unknown>[],
	};
}

/**
 * The latest turn a pane's timeline shows as finished.
 * @param socket The pane's socket.
 * @returns Its id, or undefined while the latest turn has not finished.
 */
async function finishedTurn(socket: ApplicationSocket): Promise<string | undefined> {
	const timeline = (await shown(socket))["timeline"] as {
		readonly turns: readonly { readonly turnId: string; readonly status: string }[];
	} | null;
	const latest = timeline?.turns.at(-1);
	return latest?.status === "completed" ? latest.turnId : undefined;
}

// A conversation per browser tab (TASK-373): the panes of one tab share its thread link, another
// tab holds its own, a reload keeps the tab's, and an approval is shown to and answered by only the
// tab whose thread asked.
test("panes of one tab session share a conversation; another tab session holds its own; a reload keeps it; New conversation starts a new workhorse and the next message runs on it", async () => {
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
		const model = seedCanonicalFixture(fixture.vault, "payments", [
			{ name: "Gateway", kind: "service" },
			{ name: "Ledger", kind: "service" },
		]);
		const register = async (body: Record<string, unknown>) =>
			(await request("/api/panes", { method: "POST", doing: false, body })).status;
		// Tab one shows two panes: A first in reading order, B focused on another board. Tab two
		// shows a pane A of its own.
		const a = await openApplicationSocket(server.base, "client-a", { tabSession: "tab-one" });
		resources.defer(() => a.close());
		const b = await openApplicationSocket(server.base, "client-b", { tabSession: "tab-one" });
		resources.defer(() => b.close());
		const c = await openApplicationSocket(server.base, "client-c", { tabSession: "tab-two" });
		resources.defer(() => c.close());
		expect(await register(pane("client-a", "A", false, true))).toBe(200);
		expect(await register({ ...pane("client-b", "B", true, false), board: "payments" })).toBe(200);
		expect(await register(pane("client-c", "A", false, false))).toBe(200);
		for (const socket of [a, b, c]) {
			expect(await socket.request("connect")).toMatchObject({ ok: true });
		}

		// A creates tab one's conversation; B, which linked nothing, reads the same one, and tab
		// two has none.
		expect((await leased(a, "threadLinkCreate")).result).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const tabOne = await linkOf(a);
		expect(tabOne).toMatchObject({ state: "executable" });
		expect(await linkOf(b)).toEqual(tabOne);
		expect((await linkOf(c))["threadId"]).toBeNull();

		// B's typed turn runs on that thread and carries B's own pane and board.
		const started = await leased(b, "start", {
			threadId: tabOne["threadId"],
			prompt: "Talk from the other pane.",
		});
		expect(started.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const turnStarts = () =>
			records(fixture.logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "turn/start",
			);
		const additional = turnStarts()[0]?.params?.["additionalContext"] as
			| { readonly archboard?: { readonly value?: unknown } }
			| undefined;
		expect(JSON.parse(String(additional?.archboard?.value))).toMatchObject({
			paneId: "B",
			board: { name: "payments" },
		});

		// Tab two starts a conversation of its own, on its own coordinator and workhorse.
		expect((await leased(c, "threadLinkCreate")).result).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const tabTwo = await linkOf(c);
		expect(tabTwo).toMatchObject({ state: "executable" });
		expect(tabTwo["threadId"]).not.toBe(tabOne["threadId"]);
		expect(await linkOf(a)).toEqual(tabOne);
		const coordinatorOf = async (socket: ApplicationSocket) =>
			((await shown(socket))["coordinator"] as Record<string, unknown>)["threadId"];
		expect(await coordinatorOf(c)).not.toBe(await coordinatorOf(a));

		// Tab one's turn asks for both kinds of approval: tab one is shown them, tab two is not.
		const pending = await waitFor(async () => {
			const { ordinary, dynamic } = await approvalsOf(b);
			return ordinary.length === 1 && dynamic.length === 1 ? { ordinary: ordinary[0]! } : undefined;
		}, "both approvals to reach tab one");
		if (pending === undefined) throw new Error("The approvals disappeared.");
		expect(await approvalsOf(c)).toEqual({ ordinary: [], dynamic: [] });
		// Nor can tab two answer the one it was not shown.
		const answer = {
			requestId: pending.ordinary["requestId"],
			approvalId: pending.ordinary["approvalId"],
			response: { approvalKind: "command_execution", decision: "accept" },
		};
		expect((await leased(c, "approvalRespond", answer)).result).toMatchObject({
			ok: true,
			value: { outcome: "not_delivered", code: "approval_not_pending" },
		});

		// The pane that created the link closes; tab one's other pane still answers both approvals.
		await a.close();
		await waitFor(async () => {
			const listed = await request<{ paneCount: number }>("/api/panes");
			return listed.body.paneCount === 2;
		}, "pane A of tab one to leave the server");
		const answered = await leased(b, "approvalRespond", answer);
		expect(answered.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const dynamicLease = await b.request("claimLease");
		const rebound = (await approvalsOf(b)).dynamic[0]!;
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

		// B starts voice on the conversation A created while B's turn still runs: the thread's
		// status is not the one its link was bound with, and that is no reason to stop telling the
		// voice where the person looks (TASK-302.07). What B picks by hand is news to that voice.
		expect(await finishedTurn(b)).toBeUndefined();
		expect(await b.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
		const voice = await leased(b, "realtimeStart", { threadId: tabOne["threadId"], sdp: "v=0" });
		expect(voice.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const handle = (voice.result.value as Record<string, unknown>)["realtimeSessionHandle"];
		const variant = model.selectedState!;
		const selected = model.modules.find((module) => module.name === "Ledger")!.id;
		const picked = await request(SEMANTIC_PANE_CONTEXT_ROUTE, {
			method: "POST",
			doing: false,
			body: {
				paneId: "B",
				clientId: "client-b",
				board: { name: "payments", key: "payments" },
				variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
				view: null,
				selection: [{ id: selected }],
				architecture: canonicalCapture(fixture.vault, model, [selected]),
				version: null,
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
					threadId: tabOne["threadId"],
					realtimeSessionHandle: handle,
				})
			).result,
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		writeFileSync(fixture.controlPath, JSON.stringify({ completeWorkhorseTurn: true }));
		await waitFor(() => finishedTurn(b), "the workhorse turn to finish");

		// Tab one reloads: its panes come back under the same tab session and find its conversation.
		await b.close();
		await waitFor(async () => {
			const listed = await request<{ paneCount: number }>("/api/panes");
			return listed.body.paneCount === 1;
		}, "tab one's panes to leave the server");
		const reloaded = await openApplicationSocket(server.base, "client-a", {
			tabSession: "tab-one",
		});
		resources.defer(() => reloaded.close());
		expect(await register(pane("client-a", "A", true, true))).toBe(200);
		expect(await reloaded.request("connect")).toMatchObject({ ok: true });
		expect(await linkOf(reloaded)).toEqual(tabOne);

		// New conversation starts a new workhorse for tab one, and the next message runs on it;
		// tab two's conversation is untouched.
		expect((await leased(reloaded, "threadLinkCreate")).result).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const replacement = await linkOf(reloaded);
		expect(replacement).toMatchObject({ state: "executable" });
		expect(replacement["threadId"]).not.toBe(tabOne["threadId"]);
		expect(replacement["threadId"]).not.toBe(tabTwo["threadId"]);
		const sent = await leased(reloaded, "start", {
			threadId: replacement["threadId"],
			prompt: "Start over.",
		});
		expect(sent.result).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		// The turn ran on the workhorse thread the New conversation started last.
		const workhorses = records(fixture.logPath)
			.filter((entry) => entry.kind === "response" && entry.method === "thread/start")
			.map((entry) => entry.result as { thread: { id: string }; model: string })
			.filter(({ model: selectedModel }) => selectedModel !== coordinatorModelFixture.model)
			.map(({ thread }) => thread.id);
		expect(workhorses).toHaveLength(3);
		expect(turnStarts().at(-1)?.params?.["threadId"]).toBe(workhorses.at(-1));
		expect(await linkOf(c)).toEqual(tabTwo);
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);
