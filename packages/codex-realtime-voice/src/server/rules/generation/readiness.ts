import type { CodexProcessSnapshot } from "@archboard/codex-app-server/process";
import type { BrowserLogin, BrowserReadiness } from "#shared/schemas/browser/snapshot.ts";
import type { BrowserAccountProjectionInput } from "#server/protocol/projection/projection-contract.ts";

const READINESS_REASON_MAX_BYTES = 512;
const textEncoder = new TextEncoder();

/** The exact owned-process facts the browser readiness arm is derived from. */
export type ServerReadinessProcessFacts = Pick<
	CodexProcessSnapshot,
	"state" | "ready" | "restartAttempt" | "nextRestartAtMs" | "failure"
>;

export interface ServerReadinessInput {
	readonly process: ServerReadinessProcessFacts;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
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
	return Array.from(value)
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
 * The readiness the account arm reports while the Codex process is running:
 * a sign-in in progress, what the account response said, or what the account
 * adapter last observed. A signed-in account is thread-capable: the
 * conversation's first message or Talk starts its coordinator.
 * @param input The live process, account and login facts.
 * @returns The readiness.
 */
function accountReadiness(input: ServerReadinessInput): BrowserReadiness {
	if (input.login.state === "pending")
		return { kind: "readiness", state: "login_pending", loginId: input.login.loginId };
	const account = input.account;
	if (account.kind === "codex_account_response") {
		return account.response.account === null
			? { kind: "readiness", state: "signed_out" }
			: { kind: "readiness", state: "thread_capable" };
	}
	return observedAccountReadiness(account);
}

/**
 * Refuse an observed account state nothing here spells out. The parameter is
 * `never`, so a state added to the adapter's vocabulary fails to compile until
 * it has an arm above.
 * @param account What was observed.
 */
function unobservedAccountState(account: never): never {
	throw new TypeError(`Unsupported observed Codex account state: ${JSON.stringify(account)}`);
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
		default:
			return unobservedAccountState(account);
	}
}

/**
 * Project one browser readiness arm from the live owned-process, session and
 * account facts. The gateway keeps no readiness of its own,
 * and nothing here writes Codex state.
 * @param input The live process, account and login facts.
 * @returns The readiness arm.
 */
export function projectServerBrowserReadiness(input: ServerReadinessInput): BrowserReadiness {
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
 * app server this server cannot speak to. Every binary_* code comes from the
 * one verifyExecutable refusal, and the server startup boundary groups them
 * the same way.
 * @param failure What the process failed with.
 * @returns The readiness, or null when the failure is not one of those.
 */
function refusedInstallationReadiness(
	failure: NonNullable<ServerReadinessProcessFacts["failure"]>,
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
 * @param input The live process, account and login facts.
 * @param process What the process reports.
 * @param failure What it last failed with, when it has.
 * @returns The readiness.
 */
function processStateReadiness(
	input: ServerReadinessInput,
	process: ServerReadinessProcessFacts,
	failure: ServerReadinessProcessFacts["failure"],
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
 * @param input The live process, account and login facts.
 * @param process What the process reports.
 * @returns The readiness.
 */
function runningReadiness(
	input: ServerReadinessInput,
	process: ServerReadinessProcessFacts,
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
	process: ServerReadinessProcessFacts,
	failure: ServerReadinessProcessFacts["failure"],
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
	process: Exclude<ServerReadinessProcessFacts, { state: "running" | "backoff" }>,
	failure: ServerReadinessProcessFacts["failure"],
): BrowserReadiness {
	const failureMessage = failure?.message ?? null;
	if (process.state === "terminal_failure") {
		return {
			kind: "readiness",
			state: "stopped",
			reason: boundedBrowserReason(failureMessage, "The Codex app server stopped."),
		};
	}
	if (NOT_RUNNING_STATES.has(process.state)) {
		return {
			kind: "readiness",
			state: "stopped",
			reason: boundedBrowserReason(failureMessage, "The Codex app server is not running."),
		};
	}
	const restartFailure = process.restartAttempt > 0 ? failureMessage : null;
	return {
		kind: "readiness",
		state: "reconnecting",
		reason: boundedBrowserReason(restartFailure, "The Codex app server is starting."),
	};
}
