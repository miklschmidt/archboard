import type { CodexProcessSnapshot } from "../../../runtime/codex-process/index.js";
import type { BrowserLogin, BrowserReadiness } from "../../../shared/codex-browser-model/index.js";
import type { BrowserAccountProjectionInput } from "../../codex-workbench/index.js";

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
 */
export function boundedBrowserReason(value: string | null | undefined, fallback: string): string {
	const collapsed = [...(value ?? "")]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 0x20 || code === 0x7f ? " " : character;
		})
		.join("")
		.replaceAll(/\s+/gu, " ")
		.trim();
	if (collapsed.length === 0) return fallback;
	if (textEncoder.encode(collapsed).byteLength <= READINESS_REASON_MAX_BYTES) return collapsed;
	let bounded = "";
	let bytes = 0;
	for (const character of collapsed) {
		const size = textEncoder.encode(character).byteLength;
		if (bytes + size > READINESS_REASON_MAX_BYTES - 3) break;
		bounded += character;
		bytes += size;
	}
	const truncated = `${bounded}…`;
	return truncated.trim().length === 0 ? fallback : truncated;
}

function accountReadiness(input: CanvasReadinessInput): BrowserReadiness {
	if (input.login.state === "pending")
		return { kind: "readiness", state: "login_pending", loginId: input.login.loginId };
	const account = input.account;
	if (account.kind === "codex_account_response") {
		if (account.response.account === null) return { kind: "readiness", state: "signed_out" };
		return input.coordinatorReady
			? { kind: "readiness", state: "thread_capable" }
			: { kind: "readiness", state: "account_ready" };
	}
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
	const unhandled: never = account;
	return unhandled;
}

/**
 * Project one browser readiness arm from the live owned-process, session,
 * account, and coordinator facts. The gateway keeps no readiness of its own,
 * and nothing here writes Codex state.
 */
export function projectCanvasBrowserReadiness(input: CanvasReadinessInput): BrowserReadiness {
	const process = input.process;
	const failure = process.failure;
	if (failure !== null) {
		if (failure.code === "storage_refused")
			return {
				kind: "readiness",
				state: "storage_mismatch",
				reason: boundedBrowserReason(failure.message, "The Codex workbench storage was refused."),
			};
		// Every binary_* code comes from the one verifyExecutable refusal, and the
		// canvas startup boundary groups them the same way.
		if (
			failure.code === "binary_invalid" ||
			failure.code === "binary_missing" ||
			failure.code === "binary_wrong_version" ||
			failure.code === "strict_config_rejected"
		)
			return {
				kind: "readiness",
				state: "incompatible_contract",
				reason: boundedBrowserReason(failure.message, "The Codex app server is incompatible."),
			};
	}
	switch (process.state) {
		case "terminal_failure":
			return {
				kind: "readiness",
				state: "stopped",
				reason: boundedBrowserReason(failure?.message, "The Codex app server stopped."),
			};
		case "backoff":
			return process.nextRestartAtMs === null
				? {
						kind: "readiness",
						state: "stopped",
						reason: boundedBrowserReason(failure?.message, "The Codex app server stopped."),
					}
				: {
						kind: "readiness",
						state: "backoff",
						retryAtMs: process.nextRestartAtMs,
						reason: boundedBrowserReason(
							failure?.message,
							"The Codex app server is waiting before its next start.",
						),
					};
		case "stopped":
		case "stopping":
		case "group_cleanup":
			return {
				kind: "readiness",
				state: "stopped",
				reason: boundedBrowserReason(failure?.message, "The Codex app server is not running."),
			};
		case "starting":
			return {
				kind: "readiness",
				state: "reconnecting",
				reason: boundedBrowserReason(
					process.restartAttempt > 0 ? failure?.message : null,
					"The Codex app server is starting.",
				),
			};
		case "running":
			return process.ready
				? accountReadiness(input)
				: {
						kind: "readiness",
						state: "reconnecting",
						reason: "The Codex app-server session is initializing.",
					};
	}
	const unhandled: never = process.state;
	return unhandled;
}
