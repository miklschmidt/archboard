import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { createIdentityAuthorities, type TurnId } from "@archboard/codex-app-server/identity";
import {
	guardWorkhorse,
	refuseWhileStopping,
	stopReport,
	stopWorkTree,
	WorkhorseStopRefusal,
} from "#server/sessions/services/stop.ts";
import type { WorkTreeStopSession } from "#server/sessions/services/work-tree-reads.ts";
import {
	freshWorkhorseState,
	type CodexWorkbenchWorkhorse,
} from "#server/sessions/services/workhorses.ts";
import type { BuiltWorkhorse } from "#server/generation/protocol/session-contract.ts";

/** The most threads a stop report names: what the result schema of `stop_workhorses` holds. */
const REMAINING_WORK_LIMIT = 100;

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
	/** True for an active thread whose turn list names no running turn. */
	hidesTurn?: boolean;
	/** True for an idle thread whose first queued request starts while its queue is read. */
	startsOnQueueRead?: boolean;
}

/**
 * Let time pass without a wait of the stop, as a slow read does.
 * @param ms How long.
 */
function advance(ms: number): void {
	jest.advanceTimersByTime(ms);
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
	const onRead: (() => void)[] = [];
	const onQueueRead: (() => void)[] = [];
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
			const read = { thread: { id: threadId, status: status(wire(threadId)) } };
			onRead.shift()?.();
			return read as never;
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
			const { turn, hidesTurn } = threads[wire(threadId)]!;
			return {
				data:
					turn === null || hidesTurn === true
						? []
						: [{ id: decoder.adoptTurnId(turn), status: "inProgress" }],
				nextCursor: null,
				backwardsCursor: null,
			} as never;
		},
		queueListPage: async ({ threadId }) => {
			const thread = threads[wire(threadId)]!;
			if (thread.startsOnQueueRead === true && thread.queue.length > 0) {
				thread.startsOnQueueRead = false;
				thread.turn = thread.queue.shift()!;
			}
			const listed = thread.queue.map((id) => ({ id: decoder.adoptQueuedSubmissionId(id) }));
			onQueueRead.shift()?.();
			return { data: listed, nextCursor: null } as never;
		},
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
	/** Time passes between two passes of the stop: Codex ends the turns it was asked to. */
	const passTime = (): void => {
		for (const id of ending) threads[id]!.turn = null;
		ending.clear();
		onWait.shift()?.();
	};
	/**
	 * Run a stop on the fake clock: each timer it waits on fires in turn, and time passes for
	 * Codex between two passes.
	 * @param stopping The stop.
	 * @returns What it observed.
	 */
	const drive = async <T>(stopping: Promise<T>): Promise<T> => {
		const seen = { done: false };
		void stopping.then(
			() => (seen.done = true),
			() => (seen.done = true),
		);
		for (let step = 0; step < 10_000; step++) {
			// One turn of the loop lets every promise the last timer released settle.
			await new Promise((resolve) => setImmediate(resolve));
			if (seen.done) break;
			jest.advanceTimersToNextTimer();
			passTime();
		}
		return stopping;
	};
	return { session, calls, threads, failing, onWait, onRead, onQueueRead, advance, drive };
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
		// The stop reads only these fields of a workhorse, so the rest of it stays unbuilt.
	} as unknown as CodexWorkbenchWorkhorse;
}

const COORDINATOR_TURN = decoder.adoptTurnId("coordinator-turn") as TurnId;

/** The reviewed time a stop observes its work tree, which timing pins. */
const WORK_TREE_STOP_MS = 5000;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("the work tree stop", () => {
	test("stops the workhorse, every nested sub-agent and every queued request, and succeeds only on a read after the interrupts", async () => {
		const codex = codexTree({
			root: { parent: null, turn: "root-turn", queue: ["queued-1"] },
			child: { parent: "root", turn: "child-turn", queue: [] },
			grandchild: { parent: "child", turn: "grandchild-turn", queue: ["queued-2"] },
		});
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));

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
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));

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
		const started = Date.now();
		const partial = await stuck.drive(stopWorkTree(workhorseOn("root"), stuck.session, null));
		expect(partial).toEqual({
			checkout: "/work/payments",
			outcome: "partial",
			remaining: [{ threadId: decoder.adoptThreadId("child"), state: "running" }],
		});
		expect(Date.now() - started).toBeGreaterThanOrEqual(WORK_TREE_STOP_MS);
		// An acknowledged interrupt is sent once per turn and never counts as an end.
		expect(stuck.calls.filter((call) => call === "interrupt child/child-turn")).toHaveLength(1);

		// An active thread whose running turn Codex does not name is never taken as stopped.
		const nameless = codexTree({
			root: { parent: null, turn: "root-turn", queue: [], hidesTurn: true },
		});
		expect(await nameless.drive(stopWorkTree(workhorseOn("root"), nameless.session, null))).toEqual(
			{
				checkout: "/work/payments",
				outcome: "partial",
				remaining: [{ threadId: decoder.adoptThreadId("root"), state: "running" }],
			},
		);
		expect(nameless.calls).toEqual([]);

		// A workhorse thread that cannot be read is unread, not running, even with no sub-agents.
		const unreadable = codexTree({ root: { parent: null, turn: "root-turn", queue: [] } });
		unreadable.failing.add("read");
		expect(
			await unreadable.drive(stopWorkTree(workhorseOn("root"), unreadable.session, null)),
		).toEqual({
			checkout: "/work/payments",
			outcome: "unconfirmed",
			remaining: [{ threadId: decoder.adoptThreadId("root"), state: "unread" }],
		});

		const unlisted = codexTree({ root: { parent: null, turn: null, queue: [] } });
		unlisted.failing.add("list");
		expect(await unlisted.drive(stopWorkTree(workhorseOn("root"), unlisted.session, null))).toEqual(
			{
				checkout: "/work/payments",
				outcome: "unconfirmed",
				remaining: [{ threadId: decoder.adoptThreadId("root"), state: "unread" }],
			},
		);
	});

	test("reports a workhorse with nothing running or waiting as idle, and sends nothing", async () => {
		const codex = codexTree({ root: { parent: null, turn: null, queue: [] } });
		expect(await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null))).toEqual({
			checkout: "/work/payments",
			outcome: "idle",
			remaining: [],
		});
		expect(await codex.drive(stopWorkTree(workhorseOn(null), codex.session, null))).toEqual({
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
		const first = stopWorkTree(workhorse, codex.session, COORDINATOR_TURN);
		// A second stop while the first runs answers with the first one's result.
		expect(await codex.drive(stopWorkTree(workhorse, codex.session, null))).toBe(await first);
		expect(refusals.every((refusal) => refusal instanceof WorkhorseStopRefusal)).toBe(true);
		expect(catching(() => refuseWhileStopping(workhorse, null))).toBeInstanceOf(
			WorkhorseStopRefusal,
		);
		expect(stopReport(workhorse)?.outcome).toBe("partial");

		codex.threads["child"]!.ignoresInterrupt = false;
		codex.threads["child"]!.turn = "child-turn-2";
		expect(
			(await codex.drive(stopWorkTree(workhorse, codex.session, COORDINATOR_TURN))).outcome,
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
			// The guard wraps only these entries, so the rest of the built workhorse stays unbuilt.
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
		workhorse.state.stop = { kind: "stopped", stop: { ...unresolved, outcome: "stopped" } };
		workhorse.state.stopAskers.add(COORDINATOR_TURN);
		const afterStop = await settled();
		expect(afterStop.filter((error) => error instanceof WorkhorseStopRefusal)).toHaveLength(4);
		expect(ran).toEqual(["queue.add", "queue.start", "threadLinks.create", "ensureStarted"]);
	});

	test("confirms an empty tree with a second read, so a queued request that started during the first is stopped", async () => {
		const codex = codexTree({
			root: { parent: null, turn: null, queue: ["queued-1"], startsOnQueueRead: true },
		});
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));
		expect(stop.outcome).toBe("stopped");
		expect(codex.calls).toEqual(["interrupt root/queued-1"]);
	});

	test("reads a thread again after its queue, so a request accepted between the reads that starts during the confirming read is stopped", async () => {
		const codex = codexTree({ root: { parent: null, turn: null, queue: [] } });
		const root = codex.threads["root"]!;
		codex.onQueueRead.push(() => {
			root.queue.push("late-1");
			root.startsOnQueueRead = true;
		});
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));
		expect(stop.outcome).toBe("stopped");
		expect(codex.calls).toEqual(["interrupt root/late-1"]);
	});

	test("acts on the work it saw even when the first read outlasted the settle time", async () => {
		const codex = codexTree({
			root: { parent: null, turn: "root-turn", queue: ["queued-1"], ignoresInterrupt: true },
		});
		codex.onRead.push(() => codex.advance(WORK_TREE_STOP_MS));
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));
		expect(stop.outcome).toBe("partial");
		expect(codex.calls).toEqual(["delete queued-1", "interrupt root/root-turn"]);
	});

	test("names at most the threads a report holds, and judges the outcome from all of them", async () => {
		const children = Object.fromEntries(
			Array.from({ length: REMAINING_WORK_LIMIT + 1 }, (_, index): [string, FakeThread] => [
				`child-${index}`,
				{ parent: "root", turn: `turn-${index}`, queue: [], ignoresInterrupt: true },
			]),
		);
		const codex = codexTree({ root: { parent: null, turn: null, queue: [] }, ...children });
		const stop = await codex.drive(stopWorkTree(workhorseOn("root"), codex.session, null));
		expect(stop.outcome).toBe("partial");
		expect(stop.remaining).toHaveLength(REMAINING_WORK_LIMIT);
	});

	test("keeps every asking coordinator turn refused across a joined stop and a later Stop control", async () => {
		const codex = codexTree({ root: { parent: null, turn: "root-turn", queue: [] } });
		const workhorse = workhorseOn("root");
		const control = codex.drive(stopWorkTree(workhorse, codex.session, null));
		await codex.drive(stopWorkTree(workhorse, codex.session, COORDINATOR_TURN));
		expect((await control).outcome).toBe("stopped");
		expect(catching(() => refuseWhileStopping(workhorse, COORDINATOR_TURN))).toBeInstanceOf(
			WorkhorseStopRefusal,
		);

		codex.threads["root"]!.turn = "restarted-turn";
		await codex.drive(stopWorkTree(workhorse, codex.session, null));
		expect(catching(() => refuseWhileStopping(workhorse, COORDINATOR_TURN))).toBeInstanceOf(
			WorkhorseStopRefusal,
		);
		expect(catching(() => refuseWhileStopping(workhorse, null))).toBeNull();
	});

	test("waits for work admitted before the stop, then stops what it started", async () => {
		const codex = codexTree({ root: { parent: null, turn: null, queue: [] } });
		const workhorse = workhorseOn("root");
		const gate = Promise.withResolvers<void>();
		const built = guardWorkhorse(() => workhorse, {
			components: {
				operations: {
					delegate: async () => {
						await gate.promise;
						codex.threads["root"]!.turn = "delegated-turn";
					},
				},
			},
			actions: {},
			// The guard wraps only the delegation here, so the rest of the built workhorse stays unbuilt.
		} as unknown as BuiltWorkhorse);
		const delegated = built.components.operations.delegate({
			call: { turnId: decoder.adoptTurnId("earlier-turn") },
		} as never);
		const stopping = codex.drive(stopWorkTree(workhorse, codex.session, null));
		gate.resolve();
		await delegated;
		expect((await stopping).outcome).toBe("stopped");
		expect(codex.calls).toEqual(["interrupt root/delegated-turn"]);
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
