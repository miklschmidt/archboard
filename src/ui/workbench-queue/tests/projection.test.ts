import { describe, expect, test } from "bun:test";

import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import { projectWorkbenchQueue, WORKBENCH_QUEUE_CONTROLS } from "../adapter.ts";
import type { WorkbenchQueueState, WorkbenchQueueView } from "../contract.ts";
import {
	capabilities,
	CHILD_ID,
	connected,
	EPOCH,
	executableLink,
	pendingApproval,
	operation,
	queue,
	snapshot,
	submission,
	THREAD_ID,
	timeline,
} from "./support.ts";

const PRESENTED = { childId: CHILD_ID, epoch: EPOCH };

function project(
	state: BrowserWorkbenchState,
	extra: Partial<Parameters<typeof projectWorkbenchQueue>[0]> = {},
): WorkbenchQueueView {
	return projectWorkbenchQueue({
		state,
		capabilities: capabilities(),
		presentedChild: PRESENTED,
		...extra,
	});
}

function stopped(reason = "No Codex workbench socket is attached."): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	};
}

const SEEDS = [{ id: "s1" }, { id: "s2", operationId: null }, { id: "s3" }] as const;

describe("workbench queue states", () => {
	test("reports loading before the first authoritative snapshot arrives", () => {
		const view = project({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			reason: "Connecting to the Codex workbench.",
		});

		expect(view.state).toBe("loading");
		expect(view.label).toBe("Loading queue");
		expect(view.detail).toContain("has not arrived yet");
		expect(view.recovery).toContain("refresh the list");
		expect(view.entries).toEqual([]);
		expect(view.add.enabled).toBe(false);
		expect(view.list.enabled).toBe(true);
	});

	test("maps every authoritative queue status to its own state, label and recovery", () => {
		const expected: readonly (readonly [
			Parameters<typeof queue>[0],
			WorkbenchQueueState,
			string,
		])[] = [
			["empty", "empty", "Queue empty"],
			["queued", "queued", "Queued"],
			["running", "running", "Running"],
			["interrupted", "interrupted_preserved", "Interrupted, queue preserved"],
			["approval_blocked", "approval_blocked", "Blocked on approval"],
			["failed", "failed", "Failed"],
			["completed", "completed", "Completed"],
			["stale", "stale", "Stale snapshot"],
			["reconnecting", "reconnecting", "Reconnecting"],
			["unavailable", "unavailable", "Queue unavailable"],
			["outcome_unknown", "outcome_unknown", "Outcome unknown"],
		];

		for (const [status, state, label] of expected) {
			const view = project(connected(snapshot({ queue: queue(status, SEEDS) })));
			expect([status, view.state]).toEqual([status, state]);
			expect(view.label).toBe(label);
			expect(view.recovery.length).toBeGreaterThan(0);
			expect(view.detail).not.toBe(view.recovery);
		}
	});

	test("interrupted preserves every submission and names its recovery", () => {
		const view = project(connected(snapshot({ queue: queue("interrupted", SEEDS) })));

		expect(view.state).toBe("interrupted_preserved");
		expect(view.entries.map((item) => item.submissionId)).toEqual([
			submission("s1"),
			submission("s2"),
			submission("s3"),
		]);
		expect(view.detail).toContain("preserved every queued submission");
		expect(view.recovery).toContain("Start the next submission");
	});

	test("approval blocking correlates the queue with the pending workhorse approval", () => {
		const view = project(
			connected(
				snapshot({
					queue: queue("approval_blocked", [{ id: "s1", status: "approval_blocked" }]),
					approvals: [pendingApproval()],
				}),
			),
		);

		expect(view.state).toBe("approval_blocked");
		expect(view.correlation.blockingApprovals).toBe(1);
		expect(view.entries[0]?.correlation).toBe(
			`Held on workhorse ${THREAD_ID} behind 1 pending approval request(s).`,
		);
	});

	test("a replaced child is a restart, whatever the queue status says", () => {
		const view = project(connected(snapshot({ queue: queue("queued", SEEDS) })), {
			presentedChild: { childId: CHILD_ID, epoch: "epoch-before" as typeof EPOCH },
		});

		expect(view.state).toBe("restarted");
		expect(view.detail).toContain("execution proof is void");
		expect(view.stale).toBe(true);
		expect(view.add.reason).toBe(view.recovery);
	});

	test("a stream sequence gap and a dropped socket outrank the queue status", () => {
		const value = snapshot({ queue: queue("queued", SEEDS) });
		const stale = project({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: value,
			sequence: 4,
			expectedSequence: 5,
			receivedSequence: 9,
			reason: "The workbench stream skipped a sequence.",
		});
		const reconnecting = project({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: value,
			sequence: 4,
			reason: "The workbench socket closed.",
		});

		expect(stale.state).toBe("stale");
		expect(reconnecting.state).toBe("reconnecting");
		for (const view of [stale, reconnecting]) {
			expect(view.stale).toBe(true);
			expect(view.entries[0]?.edit.enabled).toBe(false);
			expect(view.entries[0]?.edit.reason).toBe(view.recovery);
			expect(view.list.enabled).toBe(true);
		}
	});

	test("a lost command outcome outranks a healthy queue until it is refreshed", () => {
		const view = project(connected(snapshot({ queue: queue("queued", SEEDS) })), {
			settlement: {
				control: "cancel",
				state: "outcome_unknown",
				code: "outcome_unknown",
				message: "The cancel command's outcome was lost.",
				submissionId: submission("s1"),
			},
		});

		expect(view.state).toBe("outcome_unknown");
		expect(view.stale).toBe(true);
		expect(view.entries[0]?.cancel.enabled).toBe(false);
		expect(view.entries[0]?.cancel.reason).toContain("Refresh the list");
	});

	test("a link this pane cannot execute leaves the queue unavailable and recoverable", () => {
		const view = project(
			connected(
				snapshot({
					queue: queue("queued", SEEDS),
					threadLink: {
						kind: "thread_link",
						state: "inspect_only",
						childId: null,
						epoch: null,
						threadId: THREAD_ID,
						sourcePresentation: "standard",
						status: "idle",
						loaded: true,
						canAcceptDirectInput: false,
						reason: "A prior child owned this thread.",
					},
				}),
			),
			{ presentedChild: null },
		);

		expect(view.state).toBe("unavailable");
		expect(view.add.enabled).toBe(false);
		expect(view.list.enabled).toBe(true);
		expect(view.correlation.linkState).toBe("inspect_only");
	});

	test("a stopped socket is the one state that cannot be refreshed", () => {
		const view = project(stopped());

		expect(view.state).toBe("unavailable");
		expect(view.list.enabled).toBe(false);
		expect(view.list.reason).toContain("no socket");
	});
});

describe("workbench queue correlation and controls", () => {
	test("names the workhorse, its turn, its child and the coordinator in every state", () => {
		const view = project(
			connected(snapshot({ queue: queue("running", SEEDS), timeline: timeline("inProgress") })),
		);

		expect(view.correlation).toMatchObject({
			linkState: "executable",
			workhorseThreadId: THREAD_ID,
			workhorseThreadStatus: "idle",
			child: { childId: CHILD_ID, epoch: EPOCH },
			activeTurnId: "turn-a",
			activeTurnStatus: "inProgress",
			coordinatorThreadId: "coordinator-a",
			coordinatorState: "ready",
			sequence: 4,
		});
		expect(view.correlation.summary).toBe(
			`Running: 3 submissions on workhorse thread ${THREAD_ID}, turn turn-a (inProgress), queued through coordinator thread coordinator-a.`,
		);
	});

	test("separates coordinator-owned entries from foreign ones and cross-links the operation", () => {
		const view = project(connected(snapshot({ queue: queue("queued", SEEDS) })));

		expect(view.coordinatorOwnedCount).toBe(2);
		expect(view.foreignCount).toBe(1);
		expect(view.entries.map((item) => item.ownership)).toEqual([
			"coordinator",
			"foreign",
			"coordinator",
		]);
		expect(view.entries[0]?.coordinatorOperationId).toBe(operation("op-s1"));
		expect(view.entries[1]?.coordinatorOperationId).toBeNull();
		expect(view.entries[1]?.correlation).toContain("outside this coordinator");
		expect(view.entries[0]?.label).toBe("Coordinator submission 1 of 3: Prompt for s1");
	});

	test("gives every unavailable control a reason a person can act on", () => {
		const running = project(
			connected(snapshot({ queue: queue("running", [{ id: "s1", status: "running" }]) })),
		);
		const settled = project(
			connected(snapshot({ queue: queue("completed", [{ id: "s1", status: "completed" }]) })),
		);
		const unsupported = projectWorkbenchQueue({
			state: connected(snapshot({ queue: queue("queued", SEEDS) })),
			capabilities: capabilities({}, ["queueDelete", "queueReorder"]),
			presentedChild: PRESENTED,
		});
		const untargeted = projectWorkbenchQueue({
			state: connected(snapshot({ queue: queue("queued", SEEDS) })),
			capabilities: capabilities(),
			presentedChild: PRESENTED,
			targetBlock: "A browser command lease is required.",
		});

		expect(running.entries[0]?.start.reason).toBe(
			"This submission is already running on the linked workhorse.",
		);
		expect(settled.entries[0]?.edit.reason).toBe(
			"This submission already settled; it is history, not queued work.",
		);
		expect(unsupported.entries[0]?.cancel.reason).toBe(
			"The host is not accepting queue delete commands for this link.",
		);
		expect(unsupported.entries[0]?.moveLater.reason).toBe(
			"The host is not accepting queue reorder commands for this link.",
		);
		expect(unsupported.entries[0]?.edit.enabled).toBe(true);
		expect(untargeted.add.reason).toBe("A browser command lease is required.");
		for (const view of [running, settled, unsupported, untargeted])
			for (const item of view.entries)
				for (const control of [
					item.edit,
					item.cancel,
					item.start,
					item.moveEarlier,
					item.moveLater,
				])
					expect(control.enabled || control.reason !== null).toBe(true);
	});

	test("refuses to move a foreign entry or the only coordinator entry", () => {
		const mixed = project(connected(snapshot({ queue: queue("queued", SEEDS) })));
		const alone = project(
			connected(
				snapshot({ queue: queue("queued", [{ id: "s1" }, { id: "s2", operationId: null }]) }),
			),
		);

		expect(mixed.entries[1]?.moveEarlier.reason).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
		expect(mixed.entries[0]?.moveEarlier.reason).toBe(
			"This submission is already the first coordinator-owned entry.",
		);
		expect(mixed.entries[0]?.moveLater.enabled).toBe(true);
		expect(mixed.entries[2]?.moveLater.reason).toBe(
			"This submission is already the last coordinator-owned entry.",
		);
		expect(alone.reorder.reason).toBe(
			"There is no other coordinator-owned submission to move one past.",
		);
	});

	test("holds every control while a command is in flight and exposes exactly six", () => {
		const view = project(connected(snapshot({ queue: queue("queued", SEEDS) })), {
			pending: { control: "start", submissionId: submission("s1") },
		});

		expect(WORKBENCH_QUEUE_CONTROLS).toEqual(["add", "list", "edit", "cancel", "reorder", "start"]);
		expect(view.add.reason).toBe("A start command is in flight; its outcome is not settled yet.");
		expect(view.entries[0]?.start.enabled).toBe(false);
		expect(view.list.enabled).toBe(true);
		expect(view.pending).toEqual({ control: "start", submissionId: submission("s1") });
	});

	test("keeps an executable link with an empty queue addable", () => {
		const view = project(connected(snapshot({ threadLink: executableLink({ status: "active" }) })));

		expect(view.state).toBe("empty");
		expect(view.add.enabled).toBe(true);
		expect(view.correlation.workhorseThreadStatus).toBe("active");
		expect(view.entries).toEqual([]);
	});
});
