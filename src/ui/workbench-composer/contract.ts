import type { BrowserSnapshot, DeliveryOutcome } from "../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

/** The workbench identities this composer targets, taken from the closed model. */
type Timeline = NonNullable<BrowserSnapshot["timeline"]>;
export type WorkbenchComposerThreadId = Timeline["threadId"];
export type WorkbenchComposerTurnId = Timeline["turns"][number]["turnId"];

/** The three literal text bodies, extracted from the closed command union. */
export type WorkbenchComposerStartDraft = Extract<
	BrowserCommandDraft,
	{ readonly command: "start" }
>;
export type WorkbenchComposerSteerDraft = Extract<
	BrowserCommandDraft,
	{ readonly command: "steer" }
>;
export type WorkbenchComposerInterruptDraft = Extract<
	BrowserCommandDraft,
	{ readonly command: "interrupt" }
>;

export type WorkbenchComposerAction = "start" | "steer" | "interrupt";

/**
 * What the composer itself refused, before any command left the browser. The
 * transport's own refusal codes stay in its `BrowserWorkbenchTransportError`
 * and are reported through `lib/vocabulary.ts`, so a person never sees two
 * vocabularies for the same fact.
 */
export type WorkbenchComposerRefusalCode =
	| "unavailable"
	| "inspect_only"
	| "empty_prompt"
	| "prompt_too_long"
	| "prompt_invalid"
	| "ambiguous_turn"
	| "no_active_turn"
	| "turn_changed"
	| "command_pending";

export interface WorkbenchComposerRefusal {
	readonly code: WorkbenchComposerRefusalCode;
	readonly message: string;
	readonly recovery: string;
}

export type WorkbenchComposerPlan =
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
	| { readonly kind: "refuse"; readonly refusal: WorkbenchComposerRefusal };

/** The authoritative in-progress turn read, taken only from the host snapshot. */
export type WorkbenchComposerTurn =
	| { readonly kind: "idle" }
	| { readonly kind: "active"; readonly turnId: WorkbenchComposerTurnId }
	| { readonly kind: "ambiguous"; readonly count: number };

export type WorkbenchComposerLink =
	| { readonly kind: "unavailable"; readonly reason: string }
	| { readonly kind: "inspect_only"; readonly reason: string }
	| {
			readonly kind: "executable";
			readonly threadId: WorkbenchComposerThreadId;
			readonly turn: WorkbenchComposerTurn;
	  };

/**
 * What happens to the text a person typed once a command settles. `restored`
 * means the live composer keeps it; `retained` means it is held in an inert
 * recovery region that nothing resubmits. See `lib/draft.ts` for why.
 */
export type WorkbenchComposerDraftDisposition = "cleared" | "restored" | "retained";

export interface WorkbenchComposerRetainedDraft {
	readonly text: string;
	readonly threadId: WorkbenchComposerThreadId;
	readonly reason: string;
}

export type WorkbenchComposerStatusState =
	| "idle"
	| "pending"
	| "refused"
	| DeliveryOutcome
	| "unavailable";

export interface WorkbenchComposerStatus {
	readonly role: "status";
	readonly label: "Codex composer status";
	readonly state: WorkbenchComposerStatusState;
	readonly message: string;
	readonly recovery: string | null;
}

export interface WorkbenchComposerState {
	/** Non-null exactly while one command holds the browser's command lease. */
	readonly pending: WorkbenchComposerAction | null;
	readonly status: WorkbenchComposerStatus;
	readonly retained: WorkbenchComposerRetainedDraft | null;
	/** Advances once per settled command, so the surface can return focus. */
	readonly settled: number;
}

/**
 * The workbench's own submission result, shaped for
 * `WorkbenchRuntimeProvider`'s `onSubmit`. `delivered` must name the
 * authoritative turn; the runtime re-checks it against the live snapshot before
 * it says a submission landed.
 */
export type WorkbenchComposerSubmissionResult =
	| { readonly outcome: "delivered"; readonly turnId: WorkbenchComposerTurnId }
	| { readonly outcome: "not_delivered"; readonly reason: string }
	| { readonly outcome: "outcome_unknown"; readonly reason: string };

export interface WorkbenchComposerCommandResult {
	readonly outcome: DeliveryOutcome;
	readonly reason: string;
}

export type WorkbenchComposerTransport = Pick<
	BrowserWorkbenchTransport,
	"capabilities" | "captureCommandTarget" | "command" | "state"
>;

export interface WorkbenchComposerControllerOptions {
	readonly transport: WorkbenchComposerTransport;
}

/**
 * One state owner for submit, steer, interrupt, pending, and the retained
 * draft. The pane hands `submit` to `WorkbenchRuntimeProvider` as its
 * `onSubmit` and the same controller to `WorkbenchComposer`, so the rendered
 * surface and the runtime's submission path can never disagree about what is
 * pending or what happened.
 */
export interface WorkbenchComposerController {
	readonly submit: (submission: {
		readonly text: string;
	}) => Promise<WorkbenchComposerSubmissionResult>;
	readonly interrupt: (turnId: WorkbenchComposerTurnId) => Promise<WorkbenchComposerCommandResult>;
	readonly getState: () => WorkbenchComposerState;
	readonly subscribe: (listener: () => void) => () => void;
	readonly dismissRetainedDraft: () => void;
}

export interface WorkbenchComposerProps {
	readonly state: BrowserWorkbenchState;
	readonly controller: WorkbenchComposerController;
	readonly className?: string;
}
