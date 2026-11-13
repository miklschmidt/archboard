import { describe, expect, test } from "bun:test";

import { CODEX_SESSION_MS } from "@archboard/timing";
import { createIdentityAuthorities, type TurnId } from "@archboard/codex-app-server/identity";
import {
	guardWorkhorse,
	refuseWhileStopping,
	stopReport,
	stopWorkTree,
	WorkhorseStopRefusal,
	type WorkTreeStopClock,
	type WorkTreeStopSession,
} from "#server/sessions/services/stop.ts";
import {
	freshWorkhorseState,
	type CodexWorkbenchWorkhorse,
} from "#server/sessions/services/workhorses.ts";
import type { BuiltWorkhorse } from "#server/generation/protocol/session-contract.ts";

const { identity } = createIdentityAuthorities();
const { decoder } = identity;
/**
 * The wire spelling of an identity, which keys the fake Codex.
 * @param value The identity.
 * @returns Its wire spelling.
 */
const wire = (value: unknown): string => decoder.serializeCodexIdentity(value as never);

/** One thread of the fake Codex: who spawned it, what runs on it and what waits on it. */
interface FakeThread {
	readonly parent: string | null;
	turn: string | null;
	queue: string[];
	/** True for a turn that keeps running after an interrupt. */
	ignoresInterrupt?: boolean;
}

/**
 * A Codex that holds one work tree. An interrupt is acknowledged at once, and the turn reports
 * that it ended only when time passes, as turn/interrupt answers before turn/completed.
 */
function codexTree(threads: Record<string, FakeThread>) {
	const calls: string[] = [];
	const ending = new Set<string>();
	const failing = new Set<"list" | "read">();
	const onWait: (() => void)[] = [];
	let now = 0;
	const descendants = (ancestor: string): string[] =>
		Object.entries(threads)
			.filter(([, thread]) => thread.parent !== null)
			.filter(([id]) => {
				for (let parent = threads[id]!.parent; parent !== null; parent = threads[parent]!.parent) {
					if (parent === ancestor) return true;
				}
				return false;
			})
			.map(([id]) => id);
	const status = (id: string) => ({ type: threads[id]!.turn === null ? "idle" : "active" });
	const session: WorkTreeStopSession = {
		threadRead: async ({ threadId }) => {
			if (failing.has("read")) throw new Error("thread/read failed");
			return { thread: { id: threadId, status: status(wire(threadId)) } } as never;
		},
		threadListPage: async (params) => {
			if (failing.has("list")) throw new Error("thread/list failed");
			// A sub-agent is not an interactive thread: a listing that names no source misses it.
			expect(params?.sourceKinds).toContain("subAgentThreadSpawn");
			const ids = descendants(wire(params?.ancestorThreadId));
			return {
				data: ids.map((id) => ({ id: decoder.adoptThreadId(id), status: status(id) })),
				readStates: null,
				nextCursor: null,
				backwardsCursor: null,
			} as never;
		},
		threadTurnsListPage: async ({ threadId }) => {
			const turn = threads[wire(threadId)]!.turn;
			return {
				data: turn === null ? [] : [{ id: decoder.adoptTurnId(turn), status: "inProgress" }],
				nextCursor: null,
				backwardsCursor: null,
			} as never;
		},
		queueListPage: async ({ threadId }) =>
			({
				data: threads[wire(threadId)]!.queue.map((id) => ({
					id: decoder.adoptQueuedSubmissionId(id),
				})),
				nextCursor: null,
			}) as never,
		queueDelete: async ({ threadId, queuedSubmissionId }) => {
			const thread = threads[wire(threadId)]!;
			calls.push(`delete ${wire(queuedSubmissionId)}`);
			thread.queue = thread.queue.filter((id) => id !== wire(queuedSubmissionId));
			return {} as never;
		},
		turnInterrupt: async ({ threadId, turnId }) => {
			calls.push(`interrupt ${wire(threadId)}/${wire(turnId)}`);
			if (!threads[wire(threadId)]!.ignoresInterrupt) ending.add(wire(threadId));
			return {} as never;
		},
	};
	const clock: WorkTreeStopClock = {
		now: () => now,
		wait: async (ms) => {
			now += ms;
			for (const id of ending) threads[id]!.turn = null;
			ending.clear();
			onWait.shift()?.();
		},
	};
	return { session, clock, calls, threads, failing, onWait };
}

/** The workhorse of one checkout, whose thread is the root of the tree. */
function workhorseOn(root: string | null): CodexWorkbenchWorkhorse {
	return {
		checkout: "/work/payments",
		key: "tab-1:/work/payments",
		state: freshWorkhorseState(),
		components: {
			workhorse: {
				snapshot: () => ({ threadId: root === null ? null : decoder.adoptThreadId(root) }),
			},
		},
	} as unknown as CodexWorkbenchWorkhorse;
}

const COORDINATOR_TURN = decoder.adoptTurnId("coordinator-turn") as TurnId;

describe("the work tree stop", () => {
	test("stops the workhorse, every nested sub-agent and every queued request, and succeeds only on a read after the interrupts", async () => {
		const codex = codexTree({
			root: { parent: null, turn: "root-turn", queue: ["queued-1"] },
			child: { parent: "root", turn: "child-turn", queue: [] },
			grandchild: { parent: "child", turn: "grandchild-turn", queue: ["queued-2"] },
		});
		const stop = await stopWorkTree(workhorseOn("root"), codex.session, null, codex.clock);

		expect(stop).toEqual({ checkout: "/work/payments", outcome: "stopped", remaining: [] });
		expect(codex.calls).toEqual([
			"delete queued-1",
			"interrupt root/root-turn",
			"interrupt child/child-turn",
			"delete queued-2",
			"interrupt grandchild/grandchild-turn",
		]);
	});

	test("stops a sub-agent accepted during the stop and a turn its mailbox restarts", async () => {
		const codex = codexTree({ root: { parent: null, turn: "root-turn", queue: [] } });
		codex.onWait.push(() => {
			codex.threads["late"] = { parent: "root", turn: "late-turn", queue: [] };
		});
		codex.onWait.push(() => {
			codex.threads["root"]!.turn = "mailbox-turn";
		});
		const stop = await stopWorkTree(workhorseOn("root"), codex.session, null, codex.clock);

		expect(stop.outcome).toBe("stopped");
		expect(codex.calls).toEqual([
			"interrupt root/root-turn",
			"interrupt late/late-turn",
			"interrupt root/mailbox-turn",
		]);
	});

	test("names work that outlives the settle time as partial, and unreadable work as unconfirmed", async () => {
		const stuck = codexTree({
			root: { parent: null, turn: "root-turn", queue: [] },
			child: { parent: "root", turn: "child-turn", queue: [], ignoresInterrupt: true },
		});
		const partial = await stopWorkTree(workhorseOn("root"), stuck.session, null, stuck.clock);
		expect(partial).toEqual({
			checkout: "/work/payments",
			outcome: "partial",
			remaining: [{ threadId: decoder.adoptThreadId("child"), state: "running" }],
		});
		expect(stuck.clock.now()).toBeGreaterThanOrEqual(CODEX_SESSION_MS.workTreeStopSettle);
		// An acknowledged interrupt is sent once per turn and never counts as an end.
		expect(stuck.calls.filter((call) => call === "interrupt child/child-turn")).toHaveLength(1);

		const unlisted = codexTree({ root: { parent: null, turn: null, queue: [] } });
		unlisted.failing.add("list");
		expect(await stopWorkTree(workhorseOn("root"), unlisted.session, null, unlisted.clock)).toEqual(
			{
				checkout: "/work/payments",
				outcome: "unconfirmed",
				remaining: [{ threadId: decoder.adoptThreadId("root"), state: "unread" }],
			},
		);
	});

	test("reports a workhorse with nothing running or waiting as idle, and sends nothing", async () => {
		const codex = codexTree({ root: { parent: null, turn: null, queue: [] } });
		expect(await stopWorkTree(workhorseOn("root"), codex.session, null, codex.clock)).toEqual({
			checkout: "/work/payments",
			outcome: "idle",
			remaining: [],
		});
		expect(await stopWorkTree(workhorseOn(null), codex.session, null, codex.clock)).toEqual({
			checkout: "/work/payments",
			outcome: "idle",
			remaining: [],
		});
		expect(codex.calls).toEqual([]);
	});

	test("refuses new work while it stops and after a partial stop; after success only the asking coordinator turn is refused", async () => {
		const codex = codexTree({
			root: { parent: null, turn: "root-turn", queue: [] },
			child: { parent: "root", turn: "child-turn", queue: [], ignoresInterrupt: true },
		});
		const workhorse = workhorseOn("root");
		const refusals: unknown[] = [];
		codex.onWait.push(() => {
			for (const turn of [null, COORDINATOR_TURN]) {
				refusals.push(catching(() => refuseWhileStopping(workhorse, turn)));
			}
			expect(stopReport(workhorse)).toEqual({ outcome: "stopping", remaining: [] });
		});
		const first = stopWorkTree(workhorse, codex.session, COORDINATOR_TURN, codex.clock);
		// A second stop while the first runs answers with the first one's result.
		expect(await stopWorkTree(workhorse, codex.session, null, codex.clock)).toBe(await first);
		expect(refusals.every((refusal) => refusal instanceof WorkhorseStopRefusal)).toBe(true);
		expect(catching(() => refuseWhileStopping(workhorse, null))).toBeInstanceOf(
			WorkhorseStopRefusal,
		);
		expect(stopReport(workhorse)?.outcome).toBe("partial");

		codex.threads["child"]!.ignoresInterrupt = false;
		codex.threads["child"]!.turn = "child-turn-2";
		expect(
			(await stopWorkTree(workhorse, codex.session, COORDINATOR_TURN, codex.clock)).outcome,
		).toBe("stopped");
		expect(catching(() => refuseWhileStopping(workhorse, COORDINATOR_TURN))).toBeInstanceOf(
			WorkhorseStopRefusal,
		);
		expect(catching(() => refuseWhileStopping(workhorse, null))).toBeNull();
		expect(
			catching(() => refuseWhileStopping(workhorse, decoder.adoptTurnId("fresh-request"))),
		).toBeNull();
	});

	test("a guarded workhorse refuses each entry that starts work, and keeps reads, deletes and the stop open", async () => {
		const workhorse = workhorseOn("root");
		const ran: string[] = [];
		const entry = (name: string) => async () => void ran.push(name);
		const built = guardWorkhorse(() => workhorse, {
			components: {
				queue: { add: entry("queue.add"), start: entry("queue.start"), list: entry("queue.list") },
				operations: {
					delegate: entry("delegate"),
					steer: entry("steer"),
					manageQueue: async (request: { operation: string }) =>
						void ran.push(`manageQueue.${request.operation}`),
				},
			},
			actions: {
				threadLinks: { create: entry("threadLinks.create") },
				ensureStarted: entry("ensureStarted"),
			},
		} as unknown as BuiltWorkhorse);
		const { queue, operations } = built.components;
		const call = { turnId: COORDINATOR_TURN };
		const starts = [
			() => queue.add({} as never),
			() => queue.start({} as never),
			() => operations.delegate({ call } as never),
			() => operations.steer({ call } as never),
			() => operations.manageQueue({ call, operation: "add" } as never),
			() => operations.manageQueue({ call, operation: "start" } as never),
			() => built.actions.threadLinks.create({} as never, {} as never),
			() => built.actions.ensureStarted(),
		];
		const settled = async () =>
			Promise.all(
				starts.map(async (start) =>
					start().then(
						() => null,
						(error: unknown) => error,
					),
				),
			);

		const unresolved = { checkout: "/work/payments", outcome: "partial" as const, remaining: [] };
		workhorse.state.stop = { kind: "unresolved", stop: unresolved };
		expect((await settled()).every((error) => error instanceof WorkhorseStopRefusal)).toBe(true);
		await queue.list();
		await operations.manageQueue({ call, operation: "delete" } as never);
		expect(ran).toEqual(["queue.list", "manageQueue.delete"]);

		// After a stop that ended all work, only the coordinator turn that asked for it is refused.
		ran.length = 0;
		workhorse.state.stop = {
			kind: "stopped",
			stop: { ...unresolved, outcome: "stopped" },
			askedBy: COORDINATOR_TURN,
		};
		const afterStop = await settled();
		expect(afterStop.filter((error) => error instanceof WorkhorseStopRefusal)).toHaveLength(4);
		expect(ran).toEqual(["queue.add", "queue.start", "threadLinks.create", "ensureStarted"]);
	});
});

/**
 * What a call threw.
 * @param call The call.
 * @returns The thrown value, or null when it returned.
 */
function catching(call: () => void): unknown {
	try {
		call();
		return null;
	} catch (error) {
		return error;
	}
}
