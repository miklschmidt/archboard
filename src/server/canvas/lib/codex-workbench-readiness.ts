import type { CodexProcessSnapshot } from "@/runtime/codex-process";
import type { BrowserLogin, BrowserReadiness } from "@/shared/codex-browser-model";
import type { BrowserAccountProjectionInput } from "@/server/codex-workbench";

const READINESS_REASON_MAX_BYTES = 512;
const textEncoder = new TextEncoder();

/** The exact owned-process facts the browser readiness arm is derived from. */
export type CanvasReadinessProcessFacts = Pick<
	CodexProcessSnapshot,
	"state" | "ready" | "restartAttempt" | "nextRestartAtMs" | "failure"
>;

export interface CanvasReadinessInput {
	readonly process: CanvasReadinessProcessFacts;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
	/** Composed thread capability: the coordinator reached its ready lifecycle state. */
	readonly coordinatorReady: boolean;
}

/**
 * Reduce a diagnostic message to one browser-safe bounded reason. Owner
 * diagnostics are already redacted where they are produced; this only enforces
 * the closed contract's shape: non-empty, no control characters, at most 512
 * UTF-8 bytes.
 * @param value The diagnostic message, when there is one.
 * @param fallback What to say when it says nothing usable.
 * @returns The bounded reason.
 */
export function boundedBrowserReason(value: string | null | undefined, fallback: string): string {
	const collapsed = collapseWhitespace(value ?? "");
	if (collapsed.length === 0) return fallback;
	if (textEncoder.encode(collapsed).byteLength <= READINESS_REASON_MAX_BYTES) return collapsed;
	const truncated = `${boundedPrefix(collapsed)}…`;
	return truncated.trim().length === 0 ? fallback : truncated;
}

/**
 * One line of text with every control character and run of whitespace reduced
 * to a single space, which is the only shape the closed contract carries.
 * @param value The diagnostic message.
 * @returns The collapsed text.
 */
function collapseWhitespace(value: string): string {
	return [...value]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 0x20 || code === 0x7f ? " " : character;
		})
		.join("")
		.replaceAll(/\s+/gu, " ")
		.trim();
}

/**
 * As much of a message as fits the byte bound with room for the ellipsis,
 * measured per character so a multi-byte one is never cut in half.
 * @param collapsed The collapsed text.
 * @returns The prefix that fits.
 */
function boundedPrefix(collapsed: string): string {
	let bounded = "";
	let bytes = 0;
	for (const character of collapsed) {
		const size = textEncoder.encode(character).byteLength;
		if (bytes + size > READINESS_REASON_MAX_BYTES - 3) break;
		bounded += character;
		bytes += size;
	}
	return bounded;
}

/**
 * The readiness a signed-in account reaches: thread-capable once the
 * coordinator is ready, and account-ready until then.
 * @param coordinatorReady Whether the coordinator reached its ready state.
 * @returns The readiness.
 */
function signedInReadiness(coordinatorReady: boolean): BrowserReadiness {
	return coordinatorReady
		? { kind: "readiness", state: "thread_capable" }
		: { kind: "readiness", state: "account_ready" };
}

/**
 * The readiness the account arm reports while the Codex process is running:
 * a sign-in in progress, what the account response said, or what the account
 * adapter last observed.
 * @param input The live process, account, login and coordinator facts.
 * @returns The readiness.
 */
function accountReadiness(input: CanvasReadinessInput): BrowserReadiness {
	if (input.login.state === "pending")
		return { kind: "readiness", state: "login_pending", loginId: input.login.loginId };
	const account = input.account;
	if (account.kind === "codex_account_response") {
		return account.response.account === null
			? { kind: "readiness", state: "signed_out" }
			: signedInReadiness(input.coordinatorReady);
	}
	return observedAccountReadiness(account);
}

/**
 * The readiness the account adapter's own last observation reports, when no
 * account response has been read.
 * @param account What the adapter last observed.
 * @returns The readiness.
 */
function observedAccountReadiness(
	account: Exclude<BrowserAccountProjectionInput, { kind: "codex_account_response" }>,
): BrowserReadiness {
	switch (account.state) {
		// The adapter sets this arm from a successful accountLogin and clears it on cancel.
		case "login_pending":
			return { kind: "readiness", state: "login_pending", loginId: account.loginId };
		case "signed_out":
			return { kind: "readiness", state: "signed_out" };
		case "failed":
			// The child is up and sign-in remains reachable; account facts are not known.
			return { kind: "readiness", state: "login_capable" };
		case "unknown":
			return { kind: "readiness", state: "initialized" };
	}
}

/**
 * Project one browser readiness arm from the live owned-process, session,
 * account, and coordinator facts. The gateway keeps no readiness of its own,
 * and nothing here writes Codex state.
 * @param input The live process, account, login and coordinator facts.
 * @returns The readiness arm.
 */
export function projectCanvasBrowserReadiness(input: CanvasReadinessInput): BrowserReadiness {
	const process = input.process;
	const failure = process.failure;
	const refused = failure === null ? null : refusedInstallationReadiness(failure);
	if (refused !== null) {
		return refused;
	}
	return processStateReadiness(input, process, failure);
}

/** The process failures that mean this Codex installation cannot serve at all. */
const INCOMPATIBLE_CODES = new Set([
	"binary_invalid",
	"binary_missing",
	"binary_wrong_version",
	"strict_config_rejected",
]);

/**
 * The readiness a refused installation reports: refused storage, or a Codex
 * app server this canvas cannot speak to. Every binary_* code comes from the
 * one verifyExecutable refusal, and the canvas startup boundary groups them
 * the same way.
 * @param failure What the process failed with.
 * @returns The readiness, or null when the failure is not one of those.
 */
function refusedInstallationReadiness(
	failure: NonNullable<CanvasReadinessProcessFacts["failure"]>,
): BrowserReadiness | null {
	if (failure.code === "storage_refused") {
		return {
			kind: "readiness",
			state: "storage_mismatch",
			reason: boundedBrowserReason(failure.message, "The Codex workbench storage was refused."),
		};
	}
	if (INCOMPATIBLE_CODES.has(failure.code)) {
		return {
			kind: "readiness",
			state: "incompatible_contract",
			reason: boundedBrowserReason(failure.message, "The Codex app server is incompatible."),
		};
	}
	return null;
}

/**
 * The readiness each process state reports.
 * @param input The live process, account, login and coordinator facts.
 * @param process What the process reports.
 * @param failure What it last failed with, when it has.
 * @returns The readiness.
 */
function processStateReadiness(
	input: CanvasReadinessInput,
	process: CanvasReadinessProcessFacts,
	failure: CanvasReadinessProcessFacts["failure"],
): BrowserReadiness {
	if (process.state === "running") {
		return runningReadiness(input, process);
	}
	if (process.state === "backoff") {
		return backoffReadiness(process, failure);
	}
	return haltedReadiness(process, failure);
}

/**
 * The readiness a running Codex process reports: its account arm once the
 * session is initialized, and reconnecting until then.
 * @param input The live process, account, login and coordinator facts.
 * @param process What the process reports.
 * @returns The readiness.
 */
function runningReadiness(
	input: CanvasReadinessInput,
	process: CanvasReadinessProcessFacts,
): BrowserReadiness {
	return process.ready
		? accountReadiness(input)
		: {
				kind: "readiness",
				state: "reconnecting",
				reason: "The Codex app-server session is initializing.",
			};
}

/**
 * The readiness a process waiting to restart reports, which is a wait only
 * while it knows when it will try again.
 * @param process What the process reports.
 * @param failure What it last failed with, when it has.
 * @returns The readiness.
 */
function backoffReadiness(
	process: CanvasReadinessProcessFacts,
	failure: CanvasReadinessProcessFacts["failure"],
): BrowserReadiness {
	if (process.nextRestartAtMs === null) {
		return {
			kind: "readiness",
			state: "stopped",
			reason: boundedBrowserReason(failure?.message, "The Codex app server stopped."),
		};
	}
	return {
		kind: "readiness",
		state: "backoff",
		retryAtMs: process.nextRestartAtMs,
		reason: boundedBrowserReason(
			failure?.message,
			"The Codex app server is waiting before its next start.",
		),
	};
}

/** The process states that mean nothing is up and nothing is on its way up. */
const NOT_RUNNING_STATES: ReadonlySet<string> = new Set(["stopped", "stopping", "group_cleanup"]);

/**
 * The readiness a process that is not running and not waiting reports: failed
 * for good, stopping, or simply not up.
 * @param process What the process reports.
 * @param failure What it last failed with, when it has.
 * @returns The readiness.
 */
function haltedReadiness(
	process: Exclude<CanvasReadinessProcessFacts, { state: "running" | "backoff" }>,
	failure: CanvasReadinessProcessFacts["failure"],
): BrowserReadiness {
	if (process.state === "terminal_failure") {
		return {
			kind: "readiness",
			state: "stopped",
			reason: boundedBrowserReason(failure?.message, "The Codex app server stopped."),
		};
	}
	if (NOT_RUNNING_STATES.has(process.state)) {
		return {
			kind: "readiness",
			state: "stopped",
			reason: boundedBrowserReason(failure?.message, "The Codex app server is not running."),
		};
	}
	const restartFailure = process.restartAttempt > 0 ? failure?.message : null;
	return {
		kind: "readiness",
		state: "reconnecting",
		reason: boundedBrowserReason(restartFailure, "The Codex app server is starting."),
	};
}
