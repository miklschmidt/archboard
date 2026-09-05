// The queue's one owner of in-flight and settled command state. It reads the
// authoritative queue through the store, emits commands against the target
// captured for the queue on screen, and never commits an optimistic order or
// outcome: the view re-renders in the host's order when the host republishes.

import type {
	WorkbenchQueueCommands,
	WorkbenchQueueControl,
	WorkbenchQueuePending,
	WorkbenchQueueReorderMove,
	WorkbenchQueueSettlement,
	WorkbenchQueueSubmissionId,
	WorkbenchQueueView,
} from "@/ui/workbench-queue/contracts";
import { createWorkbenchQueueCommands } from "@/ui/workbench-queue/lib/actions";
import { projectWorkbenchQueue } from "@/ui/workbench-queue/lib/projection";
import { planQueueReorder } from "@/ui/workbench-queue/lib/reorder";
import { createWorkbenchQueueStore } from "@/ui/workbench-queue/lib/store";
import type {
	WorkbenchCommandIntent,
	WorkbenchQueueTransportPort,
} from "@/ui/workbench-queue/transport-port";
import type { WorkbenchQueueActions } from "@/ui/workbench/contracts";

/** The controller's own state beside the transport's. */
interface WorkbenchQueueCommandState {
	readonly pending: WorkbenchQueuePending | null;
	readonly settlement: WorkbenchQueueSettlement | null;
}

/** The queue controller. */
interface WorkbenchQueueController {
	/** Notified when the transport or the command state changes. */
	readonly subscribe: (listener: () => void) => () => void;
	/** The view for the current transport observation and command state. */
	readonly view: () => WorkbenchQueueView;
	readonly commandState: () => WorkbenchQueueCommandState;
	/** Re-read the authoritative list; the recovery for every unproven state. */
	readonly list: () => Promise<WorkbenchQueueSettlement>;
	/** The composer's explicit queue intent: park a message behind the current turn. */
	readonly add: (prompt: string) => Promise<WorkbenchQueueSettlement>;
	readonly edit: (
		submissionId: WorkbenchQueueSubmissionId,
		prompt: string,
	) => Promise<WorkbenchQueueSettlement>;
	readonly cancel: (submissionId: WorkbenchQueueSubmissionId) => Promise<WorkbenchQueueSettlement>;
	readonly start: (submissionId: WorkbenchQueueSubmissionId) => Promise<WorkbenchQueueSettlement>;
	readonly move: (
		submissionId: WorkbenchQueueSubmissionId,
		move: WorkbenchQueueReorderMove,
	) => Promise<WorkbenchQueueSettlement>;
	/** The actions the committed queue panel calls. */
	readonly panelActions: WorkbenchQueueActions;
}

/** One command, given its captured target. */
type Dispatch = (target: WorkbenchCommandIntent) => Promise<WorkbenchQueueSettlement>;

const STEP_EARLIER: WorkbenchQueueReorderMove = Object.freeze({
	kind: "step",
	direction: "earlier",
});
const STEP_LATER: WorkbenchQueueReorderMove = Object.freeze({ kind: "step", direction: "later" });

/**
 * A refusal this module decided on its own, before the wire.
 * @param control The control.
 * @param submissionId The submission, or null.
 * @param message Why.
 * @returns The settlement.
 */
function localRefusal(
	control: WorkbenchQueueControl,
	submissionId: WorkbenchQueueSubmissionId | null,
	message: string,
): WorkbenchQueueSettlement {
	return Object.freeze({ control, state: "refused", code: null, message, submissionId });
}

/**
 * One queue controller over one transport.
 * @param transport The transport port.
 * @returns The controller.
 */
function createWorkbenchQueueController(
	transport: WorkbenchQueueTransportPort,
): WorkbenchQueueController {
	const store = createWorkbenchQueueStore(transport);
	const commands: WorkbenchQueueCommands = createWorkbenchQueueCommands(transport);
	const listeners = new Set<() => void>();
	let commandState: WorkbenchQueueCommandState = Object.freeze({
		pending: null,
		settlement: null,
	});

	/**
	 * Publish new command state.
	 * @param next The state.
	 */
	function publish(next: WorkbenchQueueCommandState): void {
		commandState = Object.freeze(next);
		for (const listener of listeners) {
			listener();
		}
	}

	/**
	 * Run one command against the target captured for the queue on screen.
	 * @param control The control.
	 * @param submissionId The submission, or null.
	 * @param dispatch The command, given its target.
	 * @returns The settlement.
	 */
	async function run(
		control: WorkbenchQueueControl,
		submissionId: WorkbenchQueueSubmissionId | null,
		dispatch: Dispatch,
	): Promise<WorkbenchQueueSettlement> {
		const capture = store.getSnapshot().target;
		if (!capture.captured) {
			const refused = localRefusal(control, submissionId, capture.reason);
			publish({ pending: null, settlement: refused });
			return refused;
		}
		publish({ pending: { control, submissionId }, settlement: commandState.settlement });
		const settled = await dispatch(capture.target);
		publish({ pending: null, settlement: settled });
		return settled;
	}

	/**
	 * Refresh the list. Refreshing is how a person accepts a replaced child:
	 * the authoritative queue that just arrived is the queue now presented.
	 * @returns The settlement.
	 */
	async function list(): Promise<WorkbenchQueueSettlement> {
		publish({
			pending: { control: "list", submissionId: null },
			settlement: commandState.settlement,
		});
		const settled = await commands.list();
		publish({ pending: null, settlement: settled });
		if (settled.state === "reconciled") {
			store.acceptCurrentChild();
		}
		return settled;
	}

	/**
	 * Queue one submission behind the current turn.
	 * @param prompt The prompt.
	 * @returns The settlement.
	 */
	function add(prompt: string): Promise<WorkbenchQueueSettlement> {
		return run("add", null, (target) => commands.add(prompt, target));
	}

	/**
	 * Replace one queued prompt.
	 * @param submissionId The submission.
	 * @param prompt The new prompt.
	 * @returns The settlement.
	 */
	function edit(
		submissionId: WorkbenchQueueSubmissionId,
		prompt: string,
	): Promise<WorkbenchQueueSettlement> {
		return run("edit", submissionId, (target) => commands.edit(submissionId, prompt, target));
	}

	/**
	 * Delete one queued submission.
	 * @param submissionId The submission.
	 * @returns The settlement.
	 */
	function cancel(submissionId: WorkbenchQueueSubmissionId): Promise<WorkbenchQueueSettlement> {
		return run("cancel", submissionId, (target) => commands.cancel(submissionId, target));
	}

	/**
	 * Start one queued submission now.
	 * @param submissionId The submission.
	 * @returns The settlement.
	 */
	function start(submissionId: WorkbenchQueueSubmissionId): Promise<WorkbenchQueueSettlement> {
		return run("start", submissionId, (target) => commands.start(submissionId, target));
	}

	/**
	 * Plan and send one reorder. A plan that moves nothing is refused here and
	 * never reaches the wire.
	 * @param submissionId The submission to move.
	 * @param reorder Where to move it.
	 * @returns The settlement.
	 */
	function move(
		submissionId: WorkbenchQueueSubmissionId,
		reorder: WorkbenchQueueReorderMove,
	): Promise<WorkbenchQueueSettlement> {
		const entries = store.getSnapshot().state.snapshot?.queue.entries ?? [];
		const plan = planQueueReorder(entries, submissionId, reorder);
		if (!plan.moved) {
			const refused = localRefusal("reorder", submissionId, plan.reason);
			publish({ pending: null, settlement: refused });
			return Promise.resolve(refused);
		}
		return run("reorder", submissionId, (target) =>
			commands.reorder(plan.orderedSubmissionIds, target, submissionId),
		);
	}

	/**
	 * Follow the transport and the command state.
	 * @param listener Notified on every change.
	 * @returns Release the subscription.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		const release = store.subscribe(listener);
		return () => {
			listeners.delete(listener);
			release();
		};
	}

	/**
	 * The view for the current observation and command state.
	 * @returns The view.
	 */
	function view(): WorkbenchQueueView {
		const observation = store.getSnapshot();
		return projectWorkbenchQueue({
			state: observation.state,
			capabilities: observation.capabilities,
			presentedChild: observation.presentedChild,
			targetBlock: observation.target.captured ? null : observation.target.reason,
			pending: commandState.pending,
			settlement: commandState.settlement,
		});
	}

	/**
	 * The panel names a submission as a plain string; the wire needs the
	 * branded id the host published. Only an id the authoritative queue holds
	 * resolves, so the panel can never name a submission the host has not.
	 * @param control The control asking.
	 * @param submissionId The panel's string.
	 * @param dispatch The command, given the resolved id.
	 */
	function fromPanel(
		control: WorkbenchQueueControl,
		submissionId: string,
		dispatch: (resolved: WorkbenchQueueSubmissionId) => Promise<WorkbenchQueueSettlement>,
	): void {
		const entries = store.getSnapshot().state.snapshot?.queue.entries ?? [];
		const entry = entries.find((candidate) => candidate.submissionId === submissionId);
		if (entry === undefined) {
			publish({
				pending: null,
				settlement: localRefusal(
					control,
					null,
					"That submission is not in the authoritative queue.",
				),
			});
			return;
		}
		void dispatch(entry.submissionId);
	}

	const panelActions: WorkbenchQueueActions = Object.freeze({
		/**
		 * Move one submission one coordinator slot earlier.
		 * @param submissionId The submission.
		 */
		moveUp: (submissionId: string): void => {
			fromPanel("reorder", submissionId, (resolved) => move(resolved, STEP_EARLIER));
		},
		/**
		 * Move one submission one coordinator slot later.
		 * @param submissionId The submission.
		 */
		moveDown: (submissionId: string): void => {
			fromPanel("reorder", submissionId, (resolved) => move(resolved, STEP_LATER));
		},
		/**
		 * Delete one queued submission.
		 * @param submissionId The submission.
		 */
		remove: (submissionId: string): void => {
			fromPanel("cancel", submissionId, cancel);
		},
		/**
		 * Start one queued submission now.
		 * @param submissionId The submission.
		 */
		sendNow: (submissionId: string): void => {
			fromPanel("start", submissionId, start);
		},
	});

	return Object.freeze({
		subscribe,
		view,
		/**
		 * The controller's own state.
		 * @returns The pending command and the last settlement.
		 */
		commandState: (): WorkbenchQueueCommandState => commandState,
		list,
		add,
		edit,
		cancel,
		start,
		move,
		panelActions,
	});
}

export {
	createWorkbenchQueueController,
	type WorkbenchQueueCommandState,
	type WorkbenchQueueController,
};
