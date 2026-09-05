import { describe, expect, test } from "bun:test";

import { projectWorkbenchQueue } from "@/ui/workbench-queue";
import {
	WORKBENCH_QUEUE_CONTROLS,
	type WorkbenchQueueProjectionInput,
	type WorkbenchQueueState,
	type WorkbenchQueueView,
} from "@/ui/workbench-queue/contracts";
import type { WorkbenchTransportState } from "@/ui/workbench-queue/transport-port";
import {
	CHILD_ID,
	COORDINATOR_THREAD_ID,
	EPOCH,
	OTHER_EPOCH,
	THREAD_ID,
	TURN_ID,
	capabilities,
	connected,
	executableLink,
	inspectOnlyLink,
	pendingApproval,
	queue,
	snapshot,
	stopped,
	submission,
	timeline,
} from "@/ui/workbench-queue/tests/support";

const PRESENTED = { childId: CHILD_ID, epoch: EPOCH };

/**
 * The view for one transport state, presented for the current child.
 * @param state The transport state.
 * @param extra Other projection inputs.
 * @returns The view.
 */
function project(
	state: WorkbenchTransportState,
	extra: Partial<WorkbenchQueueProjectionInput> = {},
): WorkbenchQueueView {
	return projectWorkbenchQueue({
		state,
		capabilities: capabilities(),
		presentedChild: PRESENTED,
		...extra,
	});
}

/**
 * A readiness arm over a connected socket.
 * @param state The readiness state.
 * @returns The transport state.
 */
function readiness(
	state: Extract<WorkbenchTransportState, { kind: "readiness" }>["state"],
): WorkbenchTransportState {
	return {
		kind: "readiness",
		state,
		connection: "connected",
		snapshot: snapshot({ queue: queue("queued", SEEDS) }),
		sequence: 4,
	};
}

const SEEDS = [{ id: "s1" }, { id: "s2", owned: false }, { id: "s3" }] as const;

/**
 * Every entry control is either enabled or carries a reason.
 * @param view The view.
 */
function expectEveryControlReasoned(view: WorkbenchQueueView): void {
	const controls = view.entries.flatMap((item) => [
		item.edit,
		item.cancel,
		item.start,
		item.moveEarlier,
		item.moveLater,
	]);
	for (const control of controls) {
		expect(control.enabled || control.reason !== null).toBe(true);
	}
}

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
			presentedChild: { childId: CHILD_ID, epoch: OTHER_EPOCH },
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
					threadLink: inspectOnlyLink("A prior child owned this thread."),
				}),
			),
			{ presentedChild: null },
		);

		expect(view.state).toBe("unavailable");
		expect(view.add.enabled).toBe(false);
		expect(view.list.enabled).toBe(true);
		expect(view.correlation.linkState).toBe("inspect_only");
	});

	test("a lost socket is its own state, and the one that refreshing cannot recover", () => {
		const view = project(stopped());

		expect(view.state).toBe("disconnected");
		expect(view.label).toBe("Disconnected");
		expect(view.recovery).toContain("Reconnect the workbench");
		expect(view.list.enabled).toBe(false);
		expect(view.list.reason).toContain("no socket");
		// A queue this pane cannot reach reads differently from a link that has no
		// queue: only the second is recovered by choosing another thread link.
		expect(view.detail).not.toBe(
			project(connected(snapshot({ queue: queue("unavailable") }))).detail,
		);
	});

	test("a stopped Codex session is not a lost socket, and refreshing is still offered", () => {
		for (const arm of ["stopped", "storage_mismatch"] as const) {
			const view = project(readiness(arm));

			expect([arm, view.state]).toEqual([arm, "session_stopped"]);
			expect(view.label).toBe("Codex session stopped");
			expect(view.detail).toContain("This pane is connected");
			// The recovery has to agree with the control: the socket is up, so a
			// refresh is reachable, and it is what recovers this.
			expect(view.recovery).toBe(
				"Refresh the list once the host's Codex session is running again.",
			);
			expect(view.list.enabled).toBe(true);
			expect(view.stale).toBe(true);
			expect(view.add.reason).toBe(view.recovery);
			expect(view.entries[0]?.cancel.reason).toBe(view.recovery);
		}
	});

	test("an incompatible Codex session says a refresh will keep reporting it", () => {
		const view = project(readiness("incompatible_contract"));

		expect(view.state).toBe("session_incompatible");
		expect(view.label).toBe("Codex session incompatible");
		expect(view.recovery).toContain("refreshing will keep reporting this until then");
		expect(view.list.enabled).toBe(true);
		expect(view.stale).toBe(true);
	});

	test("the same readiness word over a lost socket is disconnected, not a session state", () => {
		const overSocketLoss = project({
			kind: "connection",
			state: "incompatible_contract",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The workbench gateway contract is incompatible.",
		});

		expect(overSocketLoss.state).toBe("disconnected");
		expect(overSocketLoss.list.enabled).toBe(false);
	});

	test("every readiness arm the host can publish has its own queue state", () => {
		const arms = [
			["stopped", "session_stopped"],
			["backoff", "reconnecting"],
			["reconnecting", "reconnecting"],
			["incompatible_contract", "session_incompatible"],
			["storage_mismatch", "session_stopped"],
			["initialized", "unavailable"],
			["login_capable", "unavailable"],
			["signed_out", "unavailable"],
			["login_pending", "unavailable"],
			["account_ready", "unavailable"],
			["thread_capable", "queued"],
		] as const;

		for (const [arm, expected] of arms) {
			expect([arm, project(readiness(arm)).state]).toEqual([arm, expected]);
		}
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
			activeTurnId: TURN_ID,
			activeTurnStatus: "inProgress",
			coordinatorThreadId: COORDINATOR_THREAD_ID,
			coordinatorState: "ready",
			sequence: 4,
		});
		expect(view.correlation.summary).toBe(
			`Running: 3 submissions on workhorse thread ${THREAD_ID}, turn ${TURN_ID} (inProgress), queued through coordinator thread ${COORDINATOR_THREAD_ID}.`,
		);
	});

	test("names the absence of a workhorse, a turn and a coordinator before a snapshot", () => {
		const view = project(stopped());

		expect(view.correlation.summary).toBe(
			"Disconnected: 0 submissions on no linked workhorse, no workhorse turn on record, queued through no coordinator thread.",
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
		expect(view.entries[0]?.coordinatorOperationId).not.toBeNull();
		expect(view.entries[1]?.coordinatorOperationId).toBeNull();
		expect(view.entries[1]?.correlation).toContain("outside this coordinator");
		expect(view.entries[0]?.label).toBe("Coordinator submission 1 of 3: Prompt for s1");
	});

	test("gives an entry's own status as the reason its controls are unavailable", () => {
		const running = project(
			connected(snapshot({ queue: queue("running", [{ id: "s1", status: "running" }]) })),
		);
		const settled = project(
			connected(snapshot({ queue: queue("completed", [{ id: "s1", status: "completed" }]) })),
		);

		expect(running.entries[0]?.start.reason).toBe(
			"This submission is already running on the linked workhorse.",
		);
		expect(settled.entries[0]?.edit.reason).toBe(
			"This submission already settled; it is history, not queued work.",
		);
		for (const view of [running, settled]) {
			expectEveryControlReasoned(view);
		}
	});

	test("gives every unavailable control a reason a person can act on", () => {
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

		expect(unsupported.entries[0]?.cancel.reason).toBe(
			"The host is not accepting queue delete commands for this link.",
		);
		expect(unsupported.entries[0]?.moveLater.reason).toBe(
			"The host is not accepting queue reorder commands for this link.",
		);
		expect(unsupported.entries[0]?.edit.enabled).toBe(true);
		expect(untargeted.add.reason).toBe("A browser command lease is required.");
		for (const view of [unsupported, untargeted]) {
			expectEveryControlReasoned(view);
		}
	});

	test("refuses to move a foreign entry or the only coordinator entry", () => {
		const mixed = project(connected(snapshot({ queue: queue("queued", SEEDS) })));
		const alone = project(
			connected(snapshot({ queue: queue("queued", [{ id: "s1" }, { id: "s2", owned: false }]) })),
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
