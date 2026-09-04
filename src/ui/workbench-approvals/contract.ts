import type {
	BrowserApproval,
	BrowserDynamicApproval,
	DeliveryOutcome,
} from "../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

/** The seven ordinary app-server human-interaction request families. */
export type WorkbenchApprovalFamily = BrowserApproval["approvalKind"];
/** The three dynamic coordination effects a person may approve. */
export type WorkbenchDynamicTool = BrowserDynamicApproval["identity"]["tool"];

/**
 * One lifecycle position shared by ordinary and dynamic approvals. The ordinary
 * contract spells its terminal delivery inside `lifecycle`; the dynamic contract
 * spells the same fact as a state name. Both reduce to this vocabulary so the
 * surface has one owner per reachable state.
 */
export type WorkbenchApprovalPhase =
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

export type WorkbenchApprovalAuthority = "live" | "removed";

export interface WorkbenchApprovalStatus {
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

export interface WorkbenchApprovalDisclosure {
	readonly label: string;
	readonly value: string;
	/** Technical tokens use the mono family; human phrases use the UI family. */
	readonly technical: boolean;
}

export interface WorkbenchApprovalLink {
	readonly label: string;
	readonly href: string;
}

export type WorkbenchApprovalControl =
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
	| "date_time"
	| "lines";

export interface WorkbenchApprovalOption {
	readonly label: string;
	readonly description: string | null;
}

export interface WorkbenchApprovalField {
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

export type WorkbenchApprovalTone = "primary" | "secondary" | "quiet";

export interface WorkbenchApprovalOffer {
	readonly id: string;
	readonly label: string;
	readonly description: string | null;
	readonly tone: WorkbenchApprovalTone;
	/** The offer reads the reviewed fields before it can be sent. */
	readonly submitsForm: boolean;
	/** True only on a genuine ordinary binary accept or decline. */
	readonly spokenEligible: boolean;
}

export interface WorkbenchApprovalSpoken {
	readonly eligible: boolean;
	readonly label: string;
	readonly detail: string;
}

export interface WorkbenchApprovalFormState {
	readonly values: Readonly<Record<string, string>>;
	readonly selections: Readonly<Record<string, readonly string[]>>;
	readonly flags: Readonly<Record<string, boolean>>;
}

export type WorkbenchApprovalFormEvent =
	| { readonly kind: "value"; readonly name: string; readonly value: string }
	| { readonly kind: "flag"; readonly name: string; readonly value: boolean }
	| { readonly kind: "selection"; readonly name: string; readonly value: readonly string[] };

export interface WorkbenchApprovalFieldError {
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

export interface WorkbenchOrdinaryApprovalCard extends WorkbenchApprovalCardBase {
	readonly kind: "ordinary";
	readonly family: WorkbenchApprovalFamily;
	/** The immutable request exactly as the host published it. */
	readonly request: BrowserApproval;
	/** The broker's own identity for this request. */
	readonly broker: readonly WorkbenchApprovalDisclosure[];
	readonly fields: readonly WorkbenchApprovalField[];
	readonly links: readonly WorkbenchApprovalLink[];
}

export interface WorkbenchDynamicApprovalCard extends WorkbenchApprovalCardBase {
	readonly kind: "dynamic";
	readonly tool: WorkbenchDynamicTool;
	/** The immutable request exactly as the host published it. */
	readonly request: BrowserDynamicApproval;
	readonly effectHash: string;
	readonly toolResult: string | null;
}

export type WorkbenchApprovalCard = WorkbenchOrdinaryApprovalCard | WorkbenchDynamicApprovalCard;

export interface WorkbenchApprovalBeaconEntry {
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
export interface WorkbenchApprovalsBeacon {
	readonly scope: "app_global";
	readonly pending: number;
	readonly total: number;
	readonly announcement: string;
	readonly entries: readonly WorkbenchApprovalBeaconEntry[];
}

export interface WorkbenchApprovalsReconciliation {
	readonly operationId: string;
	readonly outcome: DeliveryOutcome;
	readonly label: string;
	readonly detail: string;
}

export interface WorkbenchApprovalsView {
	readonly beacon: WorkbenchApprovalsBeacon;
	readonly cards: readonly WorkbenchApprovalCard[];
	readonly reconciliation: WorkbenchApprovalsReconciliation | null;
	readonly authority: WorkbenchApprovalAuthority;
	readonly authorityReason: string | null;
	readonly empty: string | null;
}

export interface WorkbenchApprovalsInput {
	readonly state: BrowserWorkbenchState;
	readonly nowMs: number;
	/** The transport's own answer to whether an approval command can be sent. */
	readonly canCommand: boolean;
}

export type WorkbenchApprovalDraftResult =
	| { readonly ok: true; readonly draft: BrowserCommandDraft }
	| { readonly ok: false; readonly errors: readonly WorkbenchApprovalFieldError[] };

export type WorkbenchApprovalDecisionResult =
	| { readonly status: "invalid"; readonly errors: readonly WorkbenchApprovalFieldError[] }
	| { readonly status: "sent"; readonly outcome: DeliveryOutcome; readonly message: string }
	| {
			readonly status: "refused";
			readonly code: string;
			readonly outcome: DeliveryOutcome;
			readonly message: string;
	  };

/** The transport surface this module uses. It never creates or owns one. */
export type WorkbenchApprovalsTransport = Pick<
	BrowserWorkbenchTransport,
	"capabilities" | "captureCommandTarget" | "command"
>;

export interface WorkbenchApprovalSubmission {
	readonly transport: WorkbenchApprovalsTransport;
	readonly card: WorkbenchApprovalCard;
	readonly offerId: string;
	readonly form: WorkbenchApprovalFormState;
	/** Captured when the offer was rendered, so navigation cannot retarget it. */
	readonly target: BrowserWorkbenchCommandTarget | null;
}

export interface WorkbenchApprovalsProps {
	readonly state: BrowserWorkbenchState;
	readonly transport: WorkbenchApprovalsTransport;
	readonly now?: () => number;
	readonly className?: string;
}
