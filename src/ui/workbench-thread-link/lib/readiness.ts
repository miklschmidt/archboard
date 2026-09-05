// Where the workbench stands from the thread link's point of view: one arm
// per connection, stream or readiness state the transport can publish, each
// with its tone, its words and the recoveries a person may take.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	ThreadLinkReadinessArm,
	ThreadLinkReadinessDisclosure,
	ThreadLinkReadinessTone,
	ThreadLinkRecoveryIntent,
} from "@/ui/workbench-thread-link/contracts";
import { threadLinkRecovery } from "@/ui/workbench-thread-link/lib/recovery";
import type {
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "@/ui/workbench-thread-link/transport-port";

type Readiness = BrowserSnapshot["readiness"];
type ConnectionState = Extract<WorkbenchTransportState, { readonly kind: "connection" }>;

/** The arm, its words and its instant. */
interface Arm {
	readonly arm: ThreadLinkReadinessArm;
	readonly detail: string;
	readonly retryAtMs: number | null;
}

/** What the readiness projection reads. */
interface ReadinessInput {
	readonly state: WorkbenchTransportState;
	readonly capabilities: WorkbenchTransportCapabilities;
	readonly hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[];
}

const ARM_LABELS = {
	stopped: "Codex is not running",
	backoff: "Codex is waiting before its next start",
	incompatible_contract: "The Codex binary is missing, wrong, or incompatible",
	storage_mismatch: "The dedicated Codex storage was refused",
	reconnecting: "Reconnecting to Codex",
	stale_snapshot: "The workbench snapshot is stale",
	initialized: "Checking sign-in",
	login_capable: "Sign-in available",
	signed_out: "Codex is signed out",
	login_pending: "A Codex sign-in is in progress",
	login_failed: "The last Codex sign-in failed",
	coordinator_failed: "Agent setup failed",
	account_ready: "Preparing the agent",
	thread_capable: "Ready to connect",
} as const satisfies Record<ThreadLinkReadinessArm, string>;

const ARM_TONES = {
	stopped: "failed",
	backoff: "blocked",
	incompatible_contract: "failed",
	storage_mismatch: "failed",
	reconnecting: "progress",
	stale_snapshot: "blocked",
	initialized: "progress",
	login_capable: "blocked",
	signed_out: "blocked",
	login_pending: "progress",
	login_failed: "failed",
	coordinator_failed: "failed",
	account_ready: "progress",
	thread_capable: "ready",
} as const satisfies Record<ThreadLinkReadinessArm, ThreadLinkReadinessTone>;

const ARM_INTENTS = {
	stopped: ["start_workbench"],
	backoff: ["start_workbench", "refresh_snapshot"],
	// The closed browser contract folds every binary_* refusal into this one arm,
	// so the host's own reason is the only thing that separates missing from wrong.
	incompatible_contract: ["choose_binary", "start_workbench"],
	// It also folds a locked dedicated home and a rejected storage configuration
	// into one arm, so both recoveries are offered together.
	storage_mismatch: ["unlock_home", "repair_storage"],
	reconnecting: ["refresh_snapshot"],
	stale_snapshot: ["refresh_snapshot"],
	initialized: ["read_account", "refresh_snapshot"],
	login_capable: ["retry_login", "read_account"],
	signed_out: ["retry_login"],
	login_pending: ["cancel_login"],
	login_failed: ["retry_login", "cancel_login"],
	coordinator_failed: ["refresh_snapshot"],
	account_ready: ["refresh_snapshot"],
	thread_capable: [],
} as const satisfies Record<ThreadLinkReadinessArm, readonly ThreadLinkRecoveryIntent[]>;

const CONNECTION_ARMS = {
	stopped: "stopped",
	reconnecting: "reconnecting",
	backoff: "backoff",
	incompatible_contract: "incompatible_contract",
} as const satisfies Record<ConnectionState["state"], ThreadLinkReadinessArm>;

const SESSION_DETAILS = {
	initialized: "Check sign-in before starting an agent.",
	login_capable: "Sign in below to start an agent.",
	signed_out: "Sign in below to start an agent.",
	login_pending: "Finish signing in to continue.",
	account_ready: "Codex is preparing the agent. Refresh the connection if this continues.",
	thread_capable: "Ready to start an agent or choose a conversation.",
} as const;

const NO_READINESS_REASON = "The workbench has published no readiness for this pane yet.";
const NO_READINESS: Readiness = {
	kind: "readiness",
	state: "reconnecting",
	reason: NO_READINESS_REASON,
};

/**
 * The arm of a connection-owner state.
 * @param state The connection state.
 * @returns The arm.
 */
function connectionArm(state: ConnectionState): Arm {
	return {
		arm: CONNECTION_ARMS[state.state],
		detail: state.reason,
		retryAtMs: state.state === "backoff" ? state.retryAtMs : null,
	};
}

/**
 * The arm of a readiness state that stops the session before sign-in.
 * @param readiness The published readiness.
 * @returns The arm, or null when the session runs.
 */
function sessionArm(readiness: Readiness): Arm | null {
	switch (readiness.state) {
		case "backoff":
			return { arm: "backoff", detail: readiness.reason, retryAtMs: readiness.retryAtMs };
		case "stopped":
		case "incompatible_contract":
		case "storage_mismatch":
		case "reconnecting":
			return { arm: readiness.state, detail: readiness.reason, retryAtMs: null };
		default:
			return null;
	}
}

/**
 * The arm of a running session: a failed sign-in, a failed coordinator, or
 * the readiness word itself.
 * @param readiness The running readiness.
 * @param snapshot The published snapshot.
 * @returns The arm.
 */
function runningArm(
	readiness: Extract<Readiness, { readonly state: keyof typeof SESSION_DETAILS }>,
	snapshot: BrowserSnapshot,
): Arm {
	if (snapshot.login.state === "failed") {
		return { arm: "login_failed", detail: snapshot.login.reason, retryAtMs: null };
	}
	if (readiness.state === "account_ready" && snapshot.coordinator.state === "failed") {
		const reason = snapshot.coordinator.reason ?? "Codex could not start the coordinator.";
		return {
			arm: "coordinator_failed",
			detail: `Agent setup failed. ${reason} Restart Codex after resolving this error.`,
			retryAtMs: null,
		};
	}
	return { arm: readiness.state, detail: SESSION_DETAILS[readiness.state], retryAtMs: null };
}

/**
 * The arm of a readiness-owner state.
 * @param snapshot The published snapshot, or null before one arrived.
 * @returns The arm.
 */
function readinessArm(snapshot: BrowserSnapshot | null): Arm {
	const readiness = snapshot?.readiness ?? NO_READINESS;
	const session = sessionArm(readiness);
	if (session !== null) {
		return session;
	}
	if (snapshot === null || !isRunning(readiness)) {
		return { arm: "reconnecting", detail: NO_READINESS_REASON, retryAtMs: null };
	}
	return runningArm(readiness, snapshot);
}

const RUNNING_STATES: ReadonlySet<Readiness["state"]> = new Set([
	"initialized",
	"login_capable",
	"signed_out",
	"login_pending",
	"account_ready",
	"thread_capable",
]);

/**
 * Whether a readiness names a running session.
 * @param readiness The published readiness.
 * @returns True for the six running arms.
 */
function isRunning(
	readiness: Readiness,
): readiness is Extract<Readiness, { readonly state: keyof typeof SESSION_DETAILS }> {
	return RUNNING_STATES.has(readiness.state);
}

/**
 * The arm of one transport state.
 * @param state The transport state.
 * @returns The arm.
 */
function armOf(state: WorkbenchTransportState): Arm {
	if (state.kind === "stream") {
		return {
			arm: "stale_snapshot",
			detail: `${state.reason} Expected sequence ${state.expectedSequence}, received ${state.receivedSequence}.`,
			retryAtMs: null,
		};
	}
	return state.kind === "connection" ? connectionArm(state) : readinessArm(state.snapshot);
}

/**
 * Where the workbench stands, with its recoveries.
 * @param input The transport state, capabilities and host intents.
 * @returns The disclosure.
 */
function projectThreadLinkReadiness(input: ReadinessInput): ThreadLinkReadinessDisclosure {
	const { arm, detail, retryAtMs } = armOf(input.state);
	return Object.freeze({
		arm,
		tone: ARM_TONES[arm],
		label: ARM_LABELS[arm],
		detail,
		retryAtMs,
		recoveries: Object.freeze(
			ARM_INTENTS[arm].map((intent) =>
				threadLinkRecovery(intent, input.capabilities, input.hostRecoveryIntents),
			),
		),
	});
}

export { projectThreadLinkReadiness, type ReadinessInput };
