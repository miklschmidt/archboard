// Where the agent stands, from the person's side: one of a handful of phases
// derived from the workbench transport's published state, each of which says
// what, if anything, stands between them and talking to the agent. Pure.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

/** Where the agent stands. */
type AgentPhase =
	/** No snapshot yet, or the socket is coming back: nothing to do but wait. */
	| { readonly kind: "connecting" }
	/** Codex cannot run here until something outside the browser changes. */
	| { readonly kind: "unavailable"; readonly reason: string; readonly retryAtMs: number | null }
	/** Codex is starting: the account or the voice coordinator is not ready yet. */
	| { readonly kind: "starting" }
	/** Nobody is signed in to Archboard's own Codex. */
	| { readonly kind: "signed_out"; readonly failure: string | null }
	/** A sign-in is waiting for the person to finish it on the provider's page. */
	| { readonly kind: "signing_in"; readonly loginId: string; readonly authUrl: string | null }
	/** The agent can take work; `linked` says whether a conversation exists yet. */
	| { readonly kind: "ready"; readonly linked: boolean };

/** Readiness states that mean Codex cannot run until something outside changes. */
const UNAVAILABLE = new Set(["stopped", "incompatible_contract", "storage_mismatch", "backoff"]);

/**
 * Why Codex cannot run, from a readiness that says it cannot.
 * @param readiness The readiness.
 * @returns The phase.
 */
function unavailable(readiness: BrowserSnapshot["readiness"]): AgentPhase {
	const reason = "reason" in readiness ? readiness.reason : "Codex is not running.";
	const retryAtMs = readiness.state === "backoff" ? readiness.retryAtMs : null;
	return { kind: "unavailable", reason, retryAtMs };
}

/**
 * The phase while a sign-in is pending: the provider page, once Codex has named it.
 * @param snapshot The snapshot.
 * @param loginId The pending sign-in.
 * @returns The phase.
 */
function signingIn(snapshot: BrowserSnapshot, loginId: string): AgentPhase {
	const { login } = snapshot;
	const authUrl = login.state === "pending" && login.loginId === loginId ? login.authUrl : null;
	return { kind: "signing_in", loginId, authUrl };
}

/**
 * The phase the account decides while the workbench is not yet thread capable.
 * @param snapshot The snapshot.
 * @returns The phase.
 */
function accountPhase(snapshot: BrowserSnapshot): AgentPhase {
	const { account } = snapshot;
	if (account.state === "signed_out") return { kind: "signed_out", failure: null };
	if (account.state === "failed") return { kind: "signed_out", failure: account.reason };
	if (account.state === "login_pending") return signingIn(snapshot, account.loginId);
	return { kind: "starting" };
}

/**
 * Where the agent stands.
 * @param state The transport's published state.
 * @returns The phase.
 */
function agentPhase(state: BrowserWorkbenchState): AgentPhase {
	if (state.kind === "connection" && state.state === "incompatible_contract") {
		return { kind: "unavailable", reason: state.reason, retryAtMs: null };
	}
	return state.kind === "readiness" ? snapshotPhase(state.snapshot) : { kind: "connecting" };
}

/**
 * Where the agent stands, from a published snapshot.
 * @param snapshot The snapshot.
 * @returns The phase.
 */
function snapshotPhase(snapshot: BrowserSnapshot): AgentPhase {
	const { readiness } = snapshot;
	if (UNAVAILABLE.has(readiness.state)) return unavailable(readiness);
	if (readiness.state === "reconnecting") return { kind: "connecting" };
	if (readiness.state === "login_pending") return signingIn(snapshot, readiness.loginId);
	if (readiness.state !== "thread_capable") return accountPhase(snapshot);
	return { kind: "ready", linked: snapshot.threadLink.state === "executable" };
}

export { agentPhase, type AgentPhase };
