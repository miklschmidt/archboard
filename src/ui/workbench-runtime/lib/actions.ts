// Every gesture the workbench presentation can make, implemented over the
// transport: thread link commands, queue commands, approval answers, the
// composer intent, and the host-owned doors (settings, chooser, voice, copy).

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserQueue,
} from "@/shared/codex-browser-model";
import type {
	ApprovalChoice,
	ComposerIntent,
	DynamicApprovalVerdict,
	WorkbenchActions,
	WorkbenchQueueActions,
	WorkbenchThreadLinkActions,
} from "@/ui/workbench/contracts";
import type { VoiceControlsActions } from "@/ui/voice-controls/contracts";
import { activeTurnId } from "@/ui/workbench/session-projection";
import type { WorkbenchComposerController } from "@/ui/workbench-composer";
import { approvalResponse } from "@/ui/workbench-runtime/lib/approval-responses";
import type { WorkbenchRuntimeStore } from "@/ui/workbench-runtime/lib/store";
import { readyStatus, type WorkbenchVisibleStatus } from "@/ui/workbench-runtime/lib/view";
import {
	BrowserWorkbenchTransportError,
	type BrowserCommandDraft,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/** What the host around the runtime owns: the doors the workbench opens. */
interface WorkbenchRuntimeHost {
	readonly openAgentSettings: () => void;
	/** Open the thread chooser; the candidates live in agent settings. */
	readonly chooseThread: () => void;
	readonly voice: VoiceControlsActions;
	/** Copy exactly the text handed over; defaults to the clipboard. */
	readonly copyText?: (text: string) => void;
}

/** What the actions are built over. */
interface WorkbenchActionsDependencies {
	readonly transport: BrowserWorkbenchTransport;
	readonly composer: WorkbenchComposerController;
	readonly store: WorkbenchRuntimeStore;
	readonly host: WorkbenchRuntimeHost;
}

/**
 * A visible status.
 * @param state The state.
 * @param message The words.
 * @param recovery The next action, or null.
 * @returns The status.
 */
function status(
	state: WorkbenchVisibleStatus["state"],
	message: string,
	recovery: string | null,
): WorkbenchVisibleStatus {
	return { role: "status", label: "Codex workbench status", state, message, recovery };
}

/**
 * The status a failed command leaves.
 * @param error The rejection.
 * @returns The status.
 */
function failureStatus(error: unknown): WorkbenchVisibleStatus {
	if (error instanceof BrowserWorkbenchTransportError) {
		return status(error.outcome, error.message, "Review the current conversation and act again.");
	}
	const message = error instanceof Error ? error.message : "The command outcome is unknown.";
	return status("outcome_unknown", message, "Inspect the current workhorse before acting again.");
}

/**
 * Copy text to the clipboard when the host provides no copier.
 * @param text The text.
 */
function copyToClipboard(text: string): void {
	globalThis.navigator.clipboard.writeText(text).catch(() => undefined);
}

/**
 * The queued submission ids with one moved by an offset.
 * @param queue The queue.
 * @param submissionId The submission to move.
 * @param offset Minus one for up, plus one for down.
 * @returns The reordered ids, or null when the move is impossible.
 */
function reordered(
	queue: BrowserQueue,
	submissionId: string,
	offset: -1 | 1,
): readonly BrowserQueue["entries"][number]["submissionId"][] | null {
	const ids = queue.entries.map((entry) => entry.submissionId);
	const index = ids.findIndex((candidate) => candidate === submissionId);
	const target = index + offset;
	const moving = ids[index];
	const neighbour = ids[target];
	if (index < 0 || moving === undefined || neighbour === undefined) {
		return null;
	}
	return ids.map((id, position) => {
		if (position === index) {
			return neighbour;
		}
		return position === target ? moving : id;
	});
}

/**
 * Build the workbench actions.
 * @param deps The transport, composer, store and host.
 * @returns The actions.
 */
function createWorkbenchActions(deps: WorkbenchActionsDependencies): WorkbenchActions {
	const { transport, composer, store, host } = deps;

	/**
	 * Run a human action with fresh authority, reporting failure as status.
	 * @param draft The draft.
	 * @returns Settles when the result is published.
	 */
	async function perform(draft: BrowserCommandDraft): Promise<void> {
		try {
			await transport.executeCommand(draft, transport.captureCommandIntent());
			store.update({ status: readyStatus() });
		} catch (error) {
			store.update({ status: failureStatus(error) });
		}
	}

	/**
	 * Run a human action without waiting.
	 * @param draft The draft.
	 */
	function fire(draft: BrowserCommandDraft): void {
		perform(draft).catch(() => undefined);
	}

	/** Refresh the snapshot after an error. */
	function retrySession(): void {
		transport.refresh().catch((error: unknown) => {
			store.update({ status: failureStatus(error) });
		});
	}

	/**
	 * Unlinking is not a wire command: the host owns the explicit link and only
	 * replaces it. The runtime refuses with the next action instead.
	 */
	function unlink(): void {
		store.update({
			status: status(
				"not_delivered",
				"The host does not drop an explicit thread link.",
				"Link a new thread or choose another workhorse.",
			),
		});
	}

	/** Create a fresh workhorse and link it. */
	function link(): void {
		fire({ command: "threadLinkCreate" });
	}

	/** Refresh the thread candidates. */
	function refresh(): void {
		fire({ command: "threadLinkRefresh" });
	}

	const threadLink: WorkbenchThreadLinkActions = {
		link,
		unlink,
		choose: host.chooseThread,
		refresh,
	};

	/**
	 * Move one queued submission.
	 * @param submissionId The submission.
	 * @param offset The direction.
	 */
	function move(submissionId: string, offset: -1 | 1): void {
		const queue = transport.snapshot()?.queue;
		const orderedSubmissionIds =
			queue === undefined ? null : reordered(queue, submissionId, offset);
		if (orderedSubmissionIds !== null) {
			fire({ command: "queueReorder", orderedSubmissionIds: [...orderedSubmissionIds] });
		}
	}

	/**
	 * The branded submission id the queue holds for an id, or null.
	 * @param submissionId The id.
	 * @returns The branded id, or null when not queued.
	 */
	function queuedId(submissionId: string): BrowserQueue["entries"][number]["submissionId"] | null {
		const entry = transport
			.snapshot()
			?.queue.entries.find((candidate) => candidate.submissionId === submissionId);
		return entry?.submissionId ?? null;
	}

	/**
	 * Move a submission up.
	 * @param submissionId The submission.
	 */
	function moveUp(submissionId: string): void {
		move(submissionId, -1);
	}

	/**
	 * Move a submission down.
	 * @param submissionId The submission.
	 */
	function moveDown(submissionId: string): void {
		move(submissionId, 1);
	}

	/**
	 * Remove a queued submission.
	 * @param submissionId The submission.
	 */
	function remove(submissionId: string): void {
		const id = queuedId(submissionId);
		if (id !== null) {
			fire({ command: "queueDelete", submissionId: id });
		}
	}

	/**
	 * Start a queued submission now.
	 * @param submissionId The submission.
	 */
	function sendNow(submissionId: string): void {
		const id = queuedId(submissionId);
		if (id !== null) {
			fire({ command: "queueStart", submissionId: id });
		}
	}

	const queue: WorkbenchQueueActions = { moveUp, moveDown, remove, sendNow };

	/**
	 * Answer an approval, marking it busy while the decision is on the wire.
	 * @param approval The approval.
	 * @param choice The choice.
	 */
	function respondToApproval(approval: BrowserApproval, choice: ApprovalChoice): void {
		const response = approvalResponse(approval, choice);
		if (response === null) {
			return;
		}
		store.setBusy(approval.requestId, true);
		void perform({
			command: "approvalRespond",
			requestId: approval.requestId,
			approvalId: approval.approvalId,
			response,
		}).finally(() => store.setBusy(approval.requestId, false));
	}

	/**
	 * Answer a dynamic approval under exact authority: the lease it was bound to.
	 * @param approval The approval.
	 * @param verdict The verdict.
	 * @returns Settles when the result is published.
	 */
	async function performDynamic(
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	): Promise<void> {
		const binding = approval.binding;
		if (binding === null) {
			return;
		}
		try {
			if (transport.lease() === null) {
				await transport.claimLease();
			}
			await transport.command({
				command: "dynamicApprovalRespond",
				capturedLink: binding.capturedLink,
				identity: approval.identity,
				effectHash: approval.effectHash,
				decision: verdict,
			});
			store.update({ status: readyStatus() });
		} catch (error) {
			store.update({ status: failureStatus(error) });
		}
	}

	/**
	 * Answer a dynamic approval, marking it busy while the decision is on the wire.
	 * @param approval The approval.
	 * @param verdict The verdict.
	 */
	function respondToDynamicApproval(
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	): void {
		const key = approval.identity.callId;
		store.setBusy(key, true);
		void performDynamic(approval, verdict).finally(() => store.setBusy(key, false));
	}

	/** Interrupt the active turn through the composer's one state owner. */
	function stopTurn(): void {
		const snapshot = transport.snapshot();
		const active = snapshot === null ? null : activeTurnId(snapshot);
		const turnId = snapshot?.timeline?.turns.find((turn) => turn.turnId === active)?.turnId;
		if (turnId !== undefined) {
			composer.interrupt(turnId).catch(() => undefined);
		}
	}

	/**
	 * Remember the composer intent.
	 * @param intent The intent.
	 */
	function setComposerIntent(intent: ComposerIntent): void {
		store.update({ intent });
	}

	/**
	 * Remember the queue choice.
	 * @param queueInstead Whether the next message is queued.
	 */
	function setQueueInstead(queueInstead: boolean): void {
		store.update({ queueInstead });
	}

	return {
		openAgentSettings: host.openAgentSettings,
		retrySession,
		threadLink,
		setComposerIntent,
		setQueueInstead,
		stopTurn,
		queue,
		respondToApproval,
		respondToDynamicApproval,
		copyVoiceContext: host.copyText ?? copyToClipboard,
		voice: host.voice,
	};
}

export { createWorkbenchActions, type WorkbenchActionsDependencies, type WorkbenchRuntimeHost };
