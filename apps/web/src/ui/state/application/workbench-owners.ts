// The owners the application composes over one pane's workbench transport:
// the composer, queue, approvals and thread-link controllers. The
// conversation is the tab's (TASK-373), so whichever pane of the tab the person
// is reading speaks for it, with that pane's board as context.

import { createSnapshotCache, type SnapshotStore } from "#ui/state/application/snapshot-cache.ts";
import { createProgressClock } from "#ui/state/application/progress-clock.ts";
import type { VoiceSession } from "@archboard/workbench/voice";
import {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
	createWorkbenchComposerController,
	type WorkbenchComposerController,
	createWorkbenchQueueController,
	type WorkbenchQueueController,
	createThreadLinkController,
	type ThreadLinkController,
} from "@archboard/workbench/controllers";
import { type BrowserWorkbenchTransport } from "@archboard/agent-workbench/browser";

/** The approvals controller's state as the cards read it. */
interface ApprovalDecisions {
	readonly busy: readonly string[];
	/** Error text per approval key: an invalid or refused decision. */
	readonly errors: Readonly<Record<string, string>>;
}

/** The owners over one transport. */
interface WorkbenchOwners {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly queue: WorkbenchQueueController;
	readonly composer: WorkbenchComposerController;
	readonly approvals: WorkbenchApprovalsController;
	readonly threadLink: ThreadLinkController;
	/** The approvals controller's decisions, cached per publication. */
	readonly approvalDecisions: SnapshotStore<ApprovalDecisions>;
	/** When the running turn last reported anything new. */
	readonly progress: SnapshotStore<number | null>;
}

/** The voice session, the pane it runs for, and that pane's transport. */
interface VoiceOwner {
	readonly paneId: string;
	readonly session: VoiceSession;
	readonly transport: BrowserWorkbenchTransport;
}

/** What the owners need from the application. */
interface WorkbenchOwnersOptions {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
}

/**
 * The approval decisions from the controller's state.
 * @param approvals The approvals controller.
 * @returns The busy keys and the error text per key.
 */
function approvalDecisions(approvals: WorkbenchApprovalsController): ApprovalDecisions {
	const state = approvals.decisionState();
	const errors: Record<string, string> = {};
	for (const [key, result] of state.results) {
		if (result.status === "invalid") {
			errors[key] = result.errors.map((error) => `${error.name}: ${error.message}`).join(" ");
		} else if (result.status === "refused") {
			errors[key] = result.message;
		}
	}
	return { busy: state.busyApprovals, errors };
}

/**
 * Compose the owners over one transport.
 * @param options The pane, the transport and how voice starts.
 * @returns The owners.
 */
function createWorkbenchOwners(options: WorkbenchOwnersOptions): WorkbenchOwners {
	const { paneId, transport } = options;
	const queue = createWorkbenchQueueController(transport);
	const composer = createWorkbenchComposerController({ transport });
	const approvals = createWorkbenchApprovalsController(transport);
	const threadLink = createThreadLinkController({
		/**
		 * The pane an action is captured against.
		 * @returns The capture.
		 */
		capturePane: () => ({ paneId, transport }),
	});
	return Object.freeze({
		paneId,
		transport,
		queue,
		composer,
		approvals,
		threadLink,
		approvalDecisions: createSnapshotCache(approvals.subscribe, () => approvalDecisions(approvals)),
		progress: createProgressClock(transport),
	});
}

export {
	createWorkbenchOwners,
	type ApprovalDecisions,
	type VoiceOwner,
	type WorkbenchOwners,
	type WorkbenchOwnersOptions,
};
