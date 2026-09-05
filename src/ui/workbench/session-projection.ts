// Pure projections of the session snapshot: readiness, thread link,
// coordinator, lease and delivery lines. Public so tests can reach them.

import type {
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserOperationOutcome,
	BrowserReadiness,
	BrowserSemanticDelivery,
	BrowserSnapshot,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import { clockTime, shortId } from "@/ui/workbench/lib/format";

/** The tone a state line paints: the lime accent, neutral, or destructive. */
type LineTone = "live" | "idle" | "warning";

/** One state line: a tone, the words, and optional recovery words. */
interface StateLine {
	tone: LineTone;
	text: string;
	/** What a person can do about a non-live state, or null. */
	recovery: string | null;
}

const READINESS_TEXT: Record<BrowserReadiness["state"], string> = {
	stopped: "Session stopped",
	backoff: "Session retrying",
	initialized: "Session starting",
	storage_mismatch: "Session storage mismatch",
	login_capable: "Sign-in required",
	signed_out: "Signed out",
	login_pending: "Sign-in pending",
	account_ready: "Account ready",
	thread_capable: "Session ready",
	reconnecting: "Session reconnecting",
	incompatible_contract: "Incompatible Codex",
};

const LIVE_READINESS: ReadonlySet<BrowserReadiness["state"]> = new Set([
	"account_ready",
	"thread_capable",
]);
const WARNING_READINESS: ReadonlySet<BrowserReadiness["state"]> = new Set([
	"stopped",
	"backoff",
	"storage_mismatch",
	"reconnecting",
	"incompatible_contract",
]);

/**
 * The words the host gave for a readiness state, when it gave any.
 * @param readiness The published readiness.
 * @returns The reason, the retry time, or null.
 */
function readinessDetail(readiness: BrowserReadiness): string | null {
	if (readiness.state === "backoff") {
		return `${readiness.reason}; retry at ${clockTime(readiness.retryAtMs)}`;
	}
	if ("reason" in readiness) {
		return readiness.reason;
	}
	return null;
}

/**
 * The readiness of the one private app-server session as a state line.
 * @param readiness The published readiness.
 * @returns The line, with recovery words for sign-in and contract states.
 */
function readinessLine(readiness: BrowserReadiness): StateLine {
	const base = READINESS_TEXT[readiness.state];
	const detail = readinessDetail(readiness);
	const text = detail === null ? base : `${base}: ${detail}`;
	if (LIVE_READINESS.has(readiness.state)) {
		return { tone: "live", text, recovery: null };
	}
	if (WARNING_READINESS.has(readiness.state)) {
		return {
			tone: "warning",
			text,
			recovery: "Archboard retries on its own; check agent settings.",
		};
	}
	const signIn = readiness.state === "login_pending" ? null : "Sign in from agent settings.";
	return { tone: "idle", text, recovery: signIn };
}

/**
 * The explicit thread link as a state line naming the workhorse.
 * @param link The published thread link.
 * @returns The line.
 */
function threadLinkLine(link: BrowserThreadLink): StateLine {
	if (link.state === "unbound") {
		return {
			tone: "idle",
			text: "No workhorse linked",
			recovery: link.reason ?? "Link a new thread or choose one.",
		};
	}
	const thread = shortId(link.threadId);
	if (link.state === "inspect_only") {
		return {
			tone: "idle",
			text: `Inspect-only ${thread} (${link.sourcePresentation}, ${link.status})`,
			recovery: link.reason ?? "This thread cannot take direct input.",
		};
	}
	return {
		tone: "live",
		text: `Workhorse ${thread} · ${link.status}`,
		recovery: link.reason ?? null,
	};
}

const COORDINATOR_TEXT: Record<BrowserCoordinator["state"], string> = {
	unbound: "Coordinator unbound",
	starting: "Coordinator starting",
	ready: "Coordinator ready",
	active: "Coordinator active",
	reconnecting: "Coordinator reconnecting",
	failed: "Coordinator failed",
};

const LIVE_COORDINATOR: ReadonlySet<BrowserCoordinator["state"]> = new Set(["ready", "active"]);
const WARNING_COORDINATOR: ReadonlySet<BrowserCoordinator["state"]> = new Set([
	"failed",
	"reconnecting",
]);

/**
 * The coordinator's model authority: the live model when it reported one,
 * else the configured one, with effort when set.
 * @param coordinator The published coordinator.
 * @returns The model phrase, or null when none is known.
 */
function coordinatorModel(coordinator: BrowserCoordinator): string | null {
	const model = coordinator.model ?? coordinator.configuredModel;
	if (model === null) {
		return null;
	}
	const effort = coordinator.effort ?? coordinator.configuredEffort;
	return effort === null ? model : `${model}/${effort}`;
}

/**
 * The tone for a coordinator state.
 * @param state The coordinator state.
 * @returns Live, warning or idle.
 */
function coordinatorTone(state: BrowserCoordinator["state"]): LineTone {
	if (LIVE_COORDINATOR.has(state)) {
		return "live";
	}
	return WARNING_COORDINATOR.has(state) ? "warning" : "idle";
}

/**
 * The separate voice coordinator as its own state line, never mixed with the
 * workhorse: its readiness, thread and model authority.
 * @param coordinator The published coordinator.
 * @returns The line.
 */
function coordinatorLine(coordinator: BrowserCoordinator): StateLine {
	const parts = [COORDINATOR_TEXT[coordinator.state]];
	if (coordinator.threadId !== null) {
		parts.push(shortId(coordinator.threadId));
	}
	const model = coordinatorModel(coordinator);
	if (model !== null) {
		parts.push(model);
	}
	return {
		tone: coordinatorTone(coordinator.state),
		text: parts.join(" · "),
		recovery: coordinator.reason ?? null,
	};
}

/**
 * The browser command lease, when one is held.
 * @param lease The published lease, or null.
 * @returns A short mono-friendly phrase, or null when no lease is published.
 */
function leaseText(lease: BrowserCommandLease | null): string | null {
	if (lease === null) {
		return null;
	}
	return `lease ${lease.state} until ${clockTime(lease.expiresAtMs)}`;
}

/**
 * The last operation outcome, when the host published one.
 * @param operation The published outcome, or null.
 * @returns A short phrase, or null.
 */
function operationText(operation: BrowserOperationOutcome | null): string | null {
	if (operation === null) {
		return null;
	}
	const outcome = operation.outcome.replace("_", " ");
	return operation.message === null ? outcome : `${outcome}: ${operation.message}`;
}

/**
 * The last semantic board delivery, when the host published one.
 * @param semantic The published delivery, or null.
 * @returns A short phrase, or null.
 */
function semanticText(semantic: BrowserSemanticDelivery | null): string | null {
	if (semantic === null) {
		return null;
	}
	const outcome = semantic.delivery.replace("_", " ");
	return `board context ${outcome} ${clockTime(semantic.capturedAtMs)}`;
}

/**
 * The active turn on the linked workhorse, if the timeline shows one.
 * @param snapshot The published snapshot.
 * @returns The turn id, or null when nothing is running.
 */
function activeTurnId(snapshot: BrowserSnapshot): string | null {
	const last = snapshot.timeline?.turns.at(-1);
	return last?.status === "inProgress" ? last.turnId : null;
}

export {
	activeTurnId,
	coordinatorLine,
	leaseText,
	operationText,
	readinessLine,
	semanticText,
	threadLinkLine,
	type LineTone,
	type StateLine,
};
