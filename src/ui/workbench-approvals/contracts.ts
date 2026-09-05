// The approvals surface's typed inputs and outputs: the seven ordinary
// families and the three dynamic effects as cards, their lifecycle phase,
// the offers and reviewed fields the model allows, the form state a decision
// reads, and how one decision settles.

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	DeliveryOutcome,
} from "@/shared/codex-browser-model";
import type {
	ApprovalCommandDraft,
	WorkbenchCommandIntent,
	WorkbenchApprovalsTransportPort,
	WorkbenchTransportState,
} from "@/ui/workbench-approvals/transport-port";

/** The seven ordinary app-server human-interaction request families. */
type WorkbenchApprovalFamily = BrowserApproval["approvalKind"];
/** The three dynamic coordination effects a person may approve. */
type WorkbenchDynamicTool = BrowserDynamicApproval["identity"]["tool"];

/**
 * One lifecycle position shared by ordinary and dynamic approvals. The
 * ordinary contract spells its terminal delivery inside `lifecycle`; the
 * dynamic contract spells the same fact as a state name. Both reduce to this
 * vocabulary so the surface has one owner per reachable state.
 */
type WorkbenchApprovalPhase =
	| "staged"
	| "pending"
	| "approved"
	| "declined"
	| "cancelled"
	| "expired"
	| "stale"
	| "disconnected"
	| "delivered"
	| "not_delivered"
	| "outcome_unknown";

type WorkbenchApprovalAuthority = "live" | "removed";

/** Where one approval stands, and whether this browser may still decide it. */
interface WorkbenchApprovalStatus {
	readonly phase: WorkbenchApprovalPhase;
	readonly label: string;
	readonly detail: string;
	readonly recovery: string | null;
	/** What the host recorded, in human words, once something was decided. */
	readonly decision: string | null;
	readonly delivery: DeliveryOutcome | null;
	readonly terminal: boolean;
	readonly authority: WorkbenchApprovalAuthority;
	readonly authorityReason: string | null;
	/** Nothing in this surface ever resumes an approval_required tool result. */
	readonly resumable: false;
}

/** One disclosed fact. */
interface WorkbenchApprovalDisclosure {
	readonly label: string;
	readonly value: string;
	/** Technical tokens use the mono family; human phrases use the UI family. */
	readonly technical: boolean;
}

/** One safe link. */
interface WorkbenchApprovalLink {
	readonly label: string;
	readonly href: string;
}

type WorkbenchApprovalControl =
	| "text"
	| "multiline"
	| "secret"
	| "number"
	| "integer"
	| "boolean"
	| "enum"
	| "multi_enum"
	| "url"
	| "email"
	| "date"
	| "date_time";

/** One choice of an enumerated field. */
interface WorkbenchApprovalOption {
	readonly label: string;
	readonly description: string | null;
}

/** One reviewed field a decision reads. */
interface WorkbenchApprovalField {
	/** Stable form key. Ordinary question ids and elicitation names keep theirs. */
	readonly name: string;
	readonly label: string;
	readonly description: string | null;
	readonly control: WorkbenchApprovalControl;
	readonly required: boolean;
	readonly secret: boolean;
	readonly options: readonly WorkbenchApprovalOption[] | null;
	/** A requestUserInput question that also accepts free text. */
	readonly allowsOther: boolean;
	readonly minimum: number | null;
	readonly maximum: number | null;
	readonly minLength: number | null;
	readonly maxLength: number | null;
	readonly minimumItems: number | null;
	readonly maximumItems: number | null;
	/** Never populated for a secret: the contract refuses to project one. */
	readonly defaultValue: string | null;
}

type WorkbenchApprovalTone = "primary" | "secondary" | "quiet";

/** One decision the model allows. */
interface WorkbenchApprovalOffer {
	readonly id: string;
	readonly label: string;
	readonly description: string | null;
	readonly tone: WorkbenchApprovalTone;
	/** The offer reads the reviewed fields before it can be sent. */
	readonly submitsForm: boolean;
	/** True only on a genuine ordinary binary accept or decline. */
	readonly spokenEligible: boolean;
}

/** Whether, and why, a request may be answered by voice. */
interface WorkbenchApprovalSpoken {
	readonly eligible: boolean;
	readonly label: string;
	readonly detail: string;
}

/** The reviewed answers, by field name. */
interface WorkbenchApprovalFormState {
	readonly values: Readonly<Record<string, string>>;
	readonly selections: Readonly<Record<string, readonly string[]>>;
	readonly flags: Readonly<Record<string, boolean>>;
}

type WorkbenchApprovalFormEvent =
	| { readonly kind: "value"; readonly name: string; readonly value: string }
	| { readonly kind: "flag"; readonly name: string; readonly value: boolean }
	| { readonly kind: "selection"; readonly name: string; readonly value: readonly string[] };

/** One validation failure. */
interface WorkbenchApprovalFieldError {
	readonly name: string;
	readonly message: string;
}

interface WorkbenchApprovalCardBase {
	readonly key: string;
	readonly title: string;
	readonly summary: string;
	readonly identity: readonly WorkbenchApprovalDisclosure[];
	readonly effect: readonly WorkbenchApprovalDisclosure[];
	readonly offers: readonly WorkbenchApprovalOffer[];
	readonly spoken: WorkbenchApprovalSpoken;
	readonly status: WorkbenchApprovalStatus;
	readonly expiresAtMs: number;
	readonly notices: readonly string[];
}

/** One ordinary app-server approval. */
interface WorkbenchOrdinaryApprovalCard extends WorkbenchApprovalCardBase {
	readonly kind: "ordinary";
	readonly family: WorkbenchApprovalFamily;
	/** The immutable request exactly as the host published it. */
	readonly request: BrowserApproval;
	/** The broker's own identity for this request. */
	readonly broker: readonly WorkbenchApprovalDisclosure[];
	readonly fields: readonly WorkbenchApprovalField[];
	readonly links: readonly WorkbenchApprovalLink[];
}

/** One dynamic coordination approval. */
interface WorkbenchDynamicApprovalCard extends WorkbenchApprovalCardBase {
	readonly kind: "dynamic";
	readonly tool: WorkbenchDynamicTool;
	/** The immutable request exactly as the host published it. */
	readonly request: BrowserDynamicApproval;
	readonly effectHash: string;
	readonly toolResult: string | null;
}

type WorkbenchApprovalCard = WorkbenchOrdinaryApprovalCard | WorkbenchDynamicApprovalCard;

/** One beacon line. */
interface WorkbenchApprovalBeaconEntry {
	readonly key: string;
	readonly label: string;
	readonly phase: WorkbenchApprovalPhase;
	/** The immutable target this request was raised against. */
	readonly target: string;
}

/**
 * The approval surface is application-global: a person must see a pending
 * request and every terminal outcome whether or not the workbench region has
 * focus, so the beacon carries the same facts as the cards in one live region.
 */
interface WorkbenchApprovalsBeacon {
	readonly scope: "app_global";
	readonly pending: number;
	readonly total: number;
	readonly announcement: string;
	readonly entries: readonly WorkbenchApprovalBeaconEntry[];
}

/** The host's authoritative outcome for the last operation. */
interface WorkbenchApprovalsReconciliation {
	readonly operationId: string;
	readonly outcome: DeliveryOutcome;
	readonly label: string;
	readonly detail: string;
}

/** Everything the surface shows. */
interface WorkbenchApprovalsView {
	readonly beacon: WorkbenchApprovalsBeacon;
	readonly cards: readonly WorkbenchApprovalCard[];
	readonly reconciliation: WorkbenchApprovalsReconciliation | null;
	readonly authority: WorkbenchApprovalAuthority;
	readonly authorityReason: string | null;
	readonly empty: string | null;
}

/** What the projection reads. */
interface WorkbenchApprovalsInput {
	readonly state: WorkbenchTransportState;
	readonly nowMs: number;
	/** The transport's own answer to whether any command can be sent. */
	readonly canCommand: boolean;
	/** The transport already knows whether it would accept each response. */
	readonly canRespondOrdinary: boolean;
	readonly canRespondDynamic: boolean;
}

type WorkbenchApprovalDraftResult =
	| { readonly ok: true; readonly draft: ApprovalCommandDraft }
	| { readonly ok: false; readonly errors: readonly WorkbenchApprovalFieldError[] };

type WorkbenchApprovalDecisionResult =
	| { readonly status: "invalid"; readonly errors: readonly WorkbenchApprovalFieldError[] }
	| { readonly status: "sent"; readonly outcome: DeliveryOutcome; readonly message: string }
	| {
			readonly status: "refused";
			readonly code: string;
			readonly outcome: DeliveryOutcome;
			readonly message: string;
	  };

/** One decision, ready to send. */
interface WorkbenchApprovalSubmission {
	readonly transport: Pick<
		WorkbenchApprovalsTransportPort,
		"capabilities" | "captureCommandIntent" | "executeCommand" | "command"
	>;
	readonly card: WorkbenchApprovalCard;
	readonly offerId: string;
	readonly form: WorkbenchApprovalFormState;
	/** Captured when the offer was rendered, so navigation cannot retarget it. */
	readonly target: WorkbenchCommandIntent | null;
}

export type {
	WorkbenchApprovalAuthority,
	WorkbenchApprovalBeaconEntry,
	WorkbenchApprovalCard,
	WorkbenchApprovalControl,
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalDisclosure,
	WorkbenchApprovalDraftResult,
	WorkbenchApprovalFamily,
	WorkbenchApprovalField,
	WorkbenchApprovalFieldError,
	WorkbenchApprovalFormEvent,
	WorkbenchApprovalFormState,
	WorkbenchApprovalLink,
	WorkbenchApprovalOffer,
	WorkbenchApprovalOption,
	WorkbenchApprovalPhase,
	WorkbenchApprovalSpoken,
	WorkbenchApprovalStatus,
	WorkbenchApprovalSubmission,
	WorkbenchApprovalTone,
	WorkbenchApprovalsBeacon,
	WorkbenchApprovalsInput,
	WorkbenchApprovalsReconciliation,
	WorkbenchApprovalsView,
	WorkbenchDynamicApprovalCard,
	WorkbenchDynamicTool,
	WorkbenchOrdinaryApprovalCard,
};
