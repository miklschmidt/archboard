// The owners the application composes over one pane's workbench transport —
// the composer, queue, approvals and thread-link controllers — and the ports
// the canvas-wide agent setup speaks through. The conversation is the
// canvas's (TASK-302.06), so whichever pane the person is reading speaks for
// it, with that pane's board as context.

import { createSnapshotCache, type SnapshotStore } from "@/ui/application/lib/snapshot-cache";
import type { AgentSetupPorts, SetupStepResult } from "@/ui/agent-setup";
import type { AgentFocus } from "@/ui/application/lib/agent-focus";
import { createProgressClock } from "@/ui/application/lib/progress-clock";
import type { VoiceSession } from "@/ui/voice-session";
import {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
} from "@/ui/workbench-approvals";
import {
	createWorkbenchComposerController,
	type WorkbenchComposerController,
} from "@/ui/workbench-composer";
import {
	createWorkbenchQueueController,
	type WorkbenchQueueController,
} from "@/ui/workbench-queue";
import { createThreadLinkController } from "@/ui/workbench-thread-link";
import type { ThreadLinkController } from "@/ui/workbench-thread-link/contracts";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

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
 * How the thread-link controller settled its last action, as a setup step.
 * @param threadLink The controller.
 * @returns The step result.
 */
function settled(threadLink: ThreadLinkController): SetupStepResult {
	const snapshot = threadLink.snapshot();
	if (snapshot.state === "failed" || snapshot.state === "inspect_only") {
		return { ok: false, reason: snapshot.announcement };
	}
	return { ok: true };
}

/**
 * Whether a turn is running on the transport's conversation.
 * @param transport The transport.
 * @returns True while the last turn is in progress.
 */
function turnRunning(transport: BrowserWorkbenchTransport): boolean {
	return transport.snapshot()?.timeline?.turns.at(-1)?.status === "inProgress";
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
		capturePane: () => ({ paneId, transport, hostRecoveryIntents: [] }),
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

/** Why a step cannot be taken while no pane is connected. */
const NO_PANE_WORDS = "No pane is connected to the canvas.";
const NO_PANE: SetupStepResult = { ok: false, reason: NO_PANE_WORDS };

/**
 * Start voice in the pane voice runs for, and keep it there until it ends.
 * @param focus The agent focus.
 * @param pinVoice Keep voice on one pane.
 * @returns The voice port.
 */
function voicePort(
	focus: AgentFocus,
	pinVoice: (paneId: string) => void,
): AgentSetupPorts["startVoice"] {
	return async (walkthrough) => {
		const voice = focus.voice();
		if (voice === null) throw new Error(NO_PANE_WORDS);
		pinVoice(voice.paneId);
		const view = await voice.session.start(walkthrough === null ? null : { walkthrough });
		if (view.failure !== null) throw new Error(view.failure.message);
	};
}

/**
 * The ports the canvas-wide agent setup speaks through: the focused pane's
 * transport and controllers, whichever pane that is when a step is taken.
 * @param focus The agent focus.
 * @param pinVoice Keep voice on the pane it starts in.
 * @returns The ports.
 */
function agentSetupPorts(focus: AgentFocus, pinVoice: (paneId: string) => void): AgentSetupPorts {
	return {
		transport: focus,
		/**
		 * Create the canvas's conversation.
		 * @returns How it settled.
		 */
		createConversation: async () => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			await owners.threadLink.create();
			return settled(owners.threadLink);
		},
		/**
		 * Start a sign-in.
		 * @param login The provider.
		 * @returns How it settled.
		 */
		signIn: async (login) => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			await owners.threadLink.login(login);
			return settled(owners.threadLink);
		},
		/**
		 * Cancel a sign-in.
		 * @param loginId The sign-in.
		 * @returns How it settled.
		 */
		cancelSignIn: async (loginId) => {
			const owners = focus.owners();
			if (owners === null) return NO_PANE;
			await owners.threadLink.cancelLogin(loginId);
			return settled(owners.threadLink);
		},
		/**
		 * Deliver one message: steered into a running turn, queued when asked.
		 * @param text The message.
		 * @param wantsQueue Whether to queue it.
		 * @returns The composer's result.
		 */
		submit: (text, wantsQueue) => {
			const owners = focus.owners();
			if (owners === null)
				return Promise.resolve({ outcome: "not_delivered", reason: NO_PANE_WORDS });
			const delivery = wantsQueue ? "queue" : turnRunning(owners.transport) ? "steer" : "send";
			return owners.composer.submit({ text, delivery });
		},
		startVoice: voicePort(focus, pinVoice),
	};
}

export {
	agentSetupPorts,
	createWorkbenchOwners,
	type ApprovalDecisions,
	type VoiceOwner,
	type WorkbenchOwners,
	type WorkbenchOwnersOptions,
};
