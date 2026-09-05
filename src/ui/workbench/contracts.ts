// The workbench's typed inputs and outputs. Everything shown comes in through
// `WorkbenchView`, grounded in the shared browser model; everything a person
// does goes out through `WorkbenchActions`. The runtime adapter
// (`src/ui/workbench-runtime`, TASK-150.07) owns both sides of the wire; this
// module keeps only disclosure state of its own.

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
	DYNAMIC_APPROVAL_DECISIONS,
} from "@/shared/codex-browser-model";
import type { CodexCommandExecutionApprovalDecision } from "@/shared/codex-app-server-contract";
import type { VoiceControlsActions, VoiceControlsView } from "@/ui/voice-controls/contracts";
import type { VoiceWaveState } from "@/ui/voice-wave/wave-state";

/**
 * Where the one private app-server session stands from the dock's point of
 * view. `ready` carries the whole published snapshot; the workbench reads
 * every panel from it and re-derives nothing the host already decided.
 */
type WorkbenchSessionView =
	| { kind: "loading" }
	| { kind: "empty"; message: string }
	| {
			kind: "error";
			message: string;
			/** Plain words for what a person can do about it. */
			recovery: string;
	  }
	| { kind: "ready"; snapshot: BrowserSnapshot };

/** A verdict on a dynamic coordination approval, as the shared model spells it. */
type DynamicApprovalVerdict = (typeof DYNAMIC_APPROVAL_DECISIONS)[number];

/** How the next composed message reaches the workhorse. */
type ComposerIntent = "send" | "steer";

/** The composer's Archboard-owned intent, beside the official input. */
interface WorkbenchComposerView {
	intent: ComposerIntent;
	/** Park the message in the thread queue instead of delivering it now. */
	queueInstead: boolean;
}

/** The live voice presentation: the controls' view and the output wave's inputs. */
interface WorkbenchVoiceView {
	controls: VoiceControlsView;
	wave: {
		state: VoiceWaveState;
		/** Measured model output level, 0..1. */
		level: number;
	};
}

/**
 * How one queue command stands: what is on the wire, how the last one
 * settled, and who owns each entry. The queue controller
 * (`src/ui/workbench-queue`) supplies it; the host composes it in.
 */
interface WorkbenchQueueCommandView {
	/** Plain words for the command on the wire, or null while none is. */
	pending: string | null;
	/** How the last command settled, until the next one starts. */
	settlement: {
		tone: "reconciled" | "refused" | "outcome_unknown";
		message: string;
	} | null;
	/** Ownership marker per submission id: the coordinator's, or foreign. */
	ownership: Readonly<Record<string, string>>;
}

/** The queue command view while no controller reports one. */
const IDLE_QUEUE_COMMAND: WorkbenchQueueCommandView = Object.freeze({
	pending: null,
	settlement: null,
	ownership: Object.freeze({}),
});

/** No approval decision has failed. */
const NO_APPROVAL_ERRORS: Readonly<Record<string, string>> = Object.freeze({});

/** What the workbench shows. */
interface WorkbenchView {
	session: WorkbenchSessionView;
	composer: WorkbenchComposerView;
	/**
	 * Keys of approvals whose decision is on the wire and not yet settled:
	 * an approval's request id, or a dynamic approval's call id.
	 */
	busyApprovals: readonly string[];
	/**
	 * Error text per approval key: a decision the approvals controller settled
	 * as invalid or refused, shown on the card until the host's record replaces it.
	 */
	approvalErrors: Readonly<Record<string, string>>;
	queueCommand: WorkbenchQueueCommandView;
	voice: WorkbenchVoiceView;
	/** The clock the freshness and expiry text is judged against. */
	nowMs: number;
	reducedMotion: boolean;
}

/**
 * A decision on one approval, as the model defines it. The runtime encodes
 * the wire response; the workbench only offers what the approval allows.
 */
type ApprovalChoice =
	| { kind: "command_decision"; decision: CodexCommandExecutionApprovalDecision }
	| { kind: "file_change_decision"; decision: "accept" | "acceptForSession" | "decline" | "cancel" }
	| { kind: "answer"; questionId: string; answer: string }
	| { kind: "approve" }
	| { kind: "decline" };

/** Queue actions, each naming the submission it acts on. */
interface WorkbenchQueueActions {
	moveUp: (submissionId: string) => void;
	moveDown: (submissionId: string) => void;
	remove: (submissionId: string) => void;
	sendNow: (submissionId: string) => void;
}

/**
 * Thread link actions. `link` creates a fresh workhorse; `choose` opens the
 * candidate chooser, which lives in the agent settings dialog; `unlink`
 * asks the runtime to drop the explicit link, which it may refuse.
 */
interface WorkbenchThreadLinkActions {
	link: () => void;
	unlink: () => void;
	choose: () => void;
	refresh: () => void;
}

/** What a person can do from the workbench. */
interface WorkbenchActions {
	/** The full settings dialog belongs to another module. */
	openAgentSettings: () => void;
	/** Try the session again after an error. */
	retrySession: () => void;
	threadLink: WorkbenchThreadLinkActions;
	setComposerIntent: (intent: ComposerIntent) => void;
	setQueueInstead: (queueInstead: boolean) => void;
	/** Interrupt the active turn. */
	stopTurn: () => void;
	queue: WorkbenchQueueActions;
	respondToApproval: (approval: BrowserApproval, choice: ApprovalChoice) => void;
	respondToDynamicApproval: (
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	) => void;
	/** Copies exactly the stored canonical brief bytes it is handed. */
	copyVoiceContext: (canonicalBrief: string) => void;
	voice: VoiceControlsActions;
}

export {
	IDLE_QUEUE_COMMAND,
	NO_APPROVAL_ERRORS,
	type ApprovalChoice,
	type ComposerIntent,
	type DynamicApprovalVerdict,
	type WorkbenchActions,
	type WorkbenchComposerView,
	type WorkbenchQueueActions,
	type WorkbenchQueueCommandView,
	type WorkbenchSessionView,
	type WorkbenchThreadLinkActions,
	type WorkbenchView,
	type WorkbenchVoiceView,
};
