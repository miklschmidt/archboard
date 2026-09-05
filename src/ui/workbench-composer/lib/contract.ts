// The composer's typed surface: the turn commands it may send, the delivery a
// person chose, the refusals it makes before anything leaves the browser, and
// the one state owner the official assistant-ui composer submits through.

import type { BrowserSnapshot, DeliveryOutcome } from "@/shared/codex-browser-model";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/** The workbench identities this composer targets, taken from the closed model. */
type Timeline = NonNullable<BrowserSnapshot["timeline"]>;
type WorkbenchComposerThreadId = Timeline["threadId"];
type WorkbenchComposerTurnId = Timeline["turns"][number]["turnId"];

/** The literal command bodies, extracted from the closed command union. */
type WorkbenchComposerStartDraft = Extract<BrowserCommandDraft, { readonly command: "start" }>;
type WorkbenchComposerSteerDraft = Extract<BrowserCommandDraft, { readonly command: "steer" }>;
type WorkbenchComposerInterruptDraft = Extract<
	BrowserCommandDraft,
	{ readonly command: "interrupt" }
>;
type WorkbenchComposerQueueDraft = Extract<BrowserCommandDraft, { readonly command: "queueAdd" }>;

type WorkbenchComposerAction = "start" | "steer" | "interrupt" | "queue";

/**
 * How a submitted message reaches the workhorse. `auto` steers while a turn
 * runs and starts otherwise; `send` always starts, so the host's in-progress
 * guard answers a person who chose it deliberately; `steer` requires the
 * active turn; `queue` parks the message in the thread queue.
 */
type WorkbenchComposerDelivery = "auto" | "send" | "steer" | "queue";

/**
 * What the composer itself refused, before any command left the browser. The
 * transport's own refusal codes stay in its `BrowserWorkbenchTransportError`
 * and are reported through the vocabulary, so a person never sees two
 * vocabularies for the same fact.
 */
type WorkbenchComposerRefusalCode =
	| "unavailable"
	| "unbound"
	| "inspect_only"
	| "empty_prompt"
	| "prompt_too_long"
	| "prompt_invalid"
	| "ambiguous_turn"
	| "no_active_turn"
	| "turn_changed"
	| "command_pending";

interface WorkbenchComposerRefusal {
	readonly code: WorkbenchComposerRefusalCode;
	readonly message: string;
	readonly recovery: string;
}

type WorkbenchComposerPlan =
	| {
			readonly kind: "dispatch";
			readonly action: "start";
			readonly draft: WorkbenchComposerStartDraft;
	  }
	| {
			readonly kind: "dispatch";
			readonly action: "steer";
			readonly draft: WorkbenchComposerSteerDraft;
	  }
	| {
			readonly kind: "dispatch";
			readonly action: "interrupt";
			readonly draft: WorkbenchComposerInterruptDraft;
	  }
	| {
			readonly kind: "dispatch";
			readonly action: "queue";
			readonly draft: WorkbenchComposerQueueDraft;
	  }
	| { readonly kind: "refuse"; readonly refusal: WorkbenchComposerRefusal };

/** The authoritative in-progress turn read, taken only from the host snapshot. */
type WorkbenchComposerTurn =
	| { readonly kind: "idle" }
	| { readonly kind: "active"; readonly turnId: WorkbenchComposerTurnId }
	| { readonly kind: "ambiguous"; readonly count: number };

type WorkbenchComposerLink =
	| { readonly kind: "unavailable"; readonly reason: string }
	/** No workhorse has been chosen for this pane yet. */
	| { readonly kind: "unbound"; readonly reason: string }
	/** A workhorse this browser may read but never send to. */
	| { readonly kind: "inspect_only"; readonly reason: string }
	| {
			readonly kind: "executable";
			readonly threadId: WorkbenchComposerThreadId;
			readonly turn: WorkbenchComposerTurn;
	  };

/**
 * What happens to the text a person typed once a command settles. `restored`
 * means the live composer keeps it; `retained` means it is held in an inert
 * recovery region that nothing resubmits.
 */
type WorkbenchComposerDraftDisposition = "cleared" | "restored" | "retained";

interface WorkbenchComposerRetainedDraft {
	readonly text: string;
	readonly threadId: WorkbenchComposerThreadId;
	readonly reason: string;
}

type WorkbenchComposerStatusState =
	| "idle"
	| "pending"
	| "refused"
	| DeliveryOutcome
	| "unavailable";

interface WorkbenchComposerStatus {
	readonly role: "status";
	readonly label: "Codex composer status";
	readonly state: WorkbenchComposerStatusState;
	readonly message: string;
	readonly recovery: string | null;
}

interface WorkbenchComposerState {
	/** Non-null exactly while one command holds the browser's command lease. */
	readonly pending: WorkbenchComposerAction | null;
	readonly status: WorkbenchComposerStatus;
	readonly retained: WorkbenchComposerRetainedDraft | null;
	/** Advances once per settled command, so a surface can return focus. */
	readonly settled: number;
}

/** One submission from the official composer. */
interface WorkbenchComposerSubmission {
	readonly text: string;
	readonly delivery?: WorkbenchComposerDelivery;
}

/**
 * The workbench's own submission result, shaped for the runtime's `onNew`.
 * `delivered` names the authoritative turn when the host reported one; a
 * queued message has no turn and reports the submission it parked.
 */
type WorkbenchComposerSubmissionResult =
	| { readonly outcome: "delivered"; readonly turnId: WorkbenchComposerTurnId }
	| { readonly outcome: "queued" }
	| { readonly outcome: "not_delivered"; readonly reason: string }
	| { readonly outcome: "outcome_unknown"; readonly reason: string };

interface WorkbenchComposerCommandResult {
	readonly outcome: DeliveryOutcome;
	readonly reason: string;
}

/**
 * The three members the composer reaches for. `capabilities()` is deliberately
 * absent: the transport re-checks command support inside `executeCommand()`
 * and refuses with its own code, so a second capability read here would only
 * be a way for the two to disagree.
 */
type WorkbenchComposerTransport = Pick<
	BrowserWorkbenchTransport,
	"captureCommandIntent" | "executeCommand" | "state"
>;

interface WorkbenchComposerControllerOptions {
	readonly transport: WorkbenchComposerTransport;
}

/**
 * One state owner for submit, steer, queue, interrupt, pending, and the
 * retained draft. Its `submit` is shaped to fit the runtime's `onNew`, so a
 * pane cannot end up with two answers about what is pending or what happened.
 */
interface WorkbenchComposerController {
	readonly submit: (
		submission: WorkbenchComposerSubmission,
	) => Promise<WorkbenchComposerSubmissionResult>;
	readonly interrupt: (turnId: WorkbenchComposerTurnId) => Promise<WorkbenchComposerCommandResult>;
	readonly getState: () => WorkbenchComposerState;
	readonly subscribe: (listener: () => void) => () => void;
	readonly dismissRetainedDraft: () => void;
}

export type {
	BrowserWorkbenchState,
	WorkbenchComposerAction,
	WorkbenchComposerCommandResult,
	WorkbenchComposerController,
	WorkbenchComposerControllerOptions,
	WorkbenchComposerDelivery,
	WorkbenchComposerDraftDisposition,
	WorkbenchComposerInterruptDraft,
	WorkbenchComposerLink,
	WorkbenchComposerPlan,
	WorkbenchComposerQueueDraft,
	WorkbenchComposerRefusal,
	WorkbenchComposerRefusalCode,
	WorkbenchComposerRetainedDraft,
	WorkbenchComposerStartDraft,
	WorkbenchComposerState,
	WorkbenchComposerStatus,
	WorkbenchComposerStatusState,
	WorkbenchComposerSteerDraft,
	WorkbenchComposerSubmission,
	WorkbenchComposerSubmissionResult,
	WorkbenchComposerThreadId,
	WorkbenchComposerTransport,
	WorkbenchComposerTurn,
	WorkbenchComposerTurnId,
};
