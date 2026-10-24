// Where the agent stands, from the person's side: one of a handful of phases
// derived from the workbench transport's published state, each of which says
// what, if anything, stands between them and talking to the agent. Pure.

import type { BrowserSnapshot } from "@archboard/agent-workbench/contract";
import type { LoginId } from "@archboard/codex-app-server/identity";
import type { BrowserWorkbenchState } from "#ui/state/transport/contract.ts";

/** Where the agent stands. */
type AgentPhase =
	/** No snapshot yet, or the socket is coming back: nothing to do but wait. */
	| { readonly kind: "connecting" }
	/** Codex cannot run here until something outside the browser changes. */
	| { readonly kind: "unavailable"; readonly reason: string }
	/**
	 * Codex is starting: the account is not known yet, or the server waits
	 * before its next start of the app server.
	 */
	| { readonly kind: "starting" }
	/** Nobody is signed in to Archboard's own Codex. */
	| { readonly kind: "signed_out"; readonly failure: string | null }
	/** A sign-in is waiting for the person to finish it on the provider's page. */
	| { readonly kind: "signing_in"; readonly loginId: LoginId; readonly authUrl: string | null }
	/**
	 * The agent can take work; `linked` says whether a conversation exists yet.
	 * Creating one starts its coordinator and its workhorse.
	 */
	| { readonly kind: "ready"; readonly linked: boolean };

/**
 * Readiness states that mean Codex cannot run until something outside changes.
 * `backoff` is not one: the server publishes it only while it knows when it
 * starts the app server again, so work waits through it.
 */
const UNAVAILABLE = new Set(["stopped", "incompatible_contract", "storage_mismatch"]);

/**
 * Why Codex cannot run, from a readiness that says it cannot.
 * @param readiness The readiness.
 * @returns The phase.
 */
function unavailable(readiness: BrowserSnapshot["readiness"]): AgentPhase {
	const reason = "reason" in readiness ? readiness.reason : "Codex is not running.";
	return { kind: "unavailable", reason };
}

/**
 * The phase while a sign-in is pending: the provider page, once Codex has named it.
 * @param snapshot The snapshot.
 * @param loginId The pending sign-in.
 * @returns The phase.
 */
function signingIn(snapshot: BrowserSnapshot, loginId: LoginId): AgentPhase {
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
	const { account, login } = snapshot;
	if (account.state === "signed_out") {
		return { kind: "signed_out", failure: login.state === "failed" ? login.reason : null };
	}
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
		return { kind: "unavailable", reason: state.reason };
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
	if (readiness.state === "backoff") return { kind: "starting" };
	return runningPhase(snapshot);
}

/**
 * The phase of a running Codex: ready for thread work once signed in, or
 * whatever the account decides.
 * @param snapshot The snapshot.
 * @returns The phase.
 */
function runningPhase(snapshot: BrowserSnapshot): AgentPhase {
	if (snapshot.readiness.state === "thread_capable") {
		return { kind: "ready", linked: snapshot.threadLink.state === "executable" };
	}
	return accountPhase(snapshot);
}

export { agentPhase, type AgentPhase };
