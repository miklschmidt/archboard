// Where the setup's own sign-in stands as the phases go by, and what becomes
// of a tab the person's gesture opened for the provider's page. Pure.

import type { AgentPhase } from "#ui/rules/agent-setup/phase.ts";

/**
 * Where the setup's own sign-in stands: none asked; asked and not yet shown
 * pending; pending at Codex; or ended without an account, so nothing asks
 * again until the person's next gesture.
 */
type SignInProgress = "none" | "asked" | "pending" | "ended";

/** Why held work stopped waiting when a sign-in ended with no reason from Codex. */
const SIGN_IN_UNFINISHED = "Sign-in did not finish.";

/** What to do with a gesture's tab. */
type TabFate =
	| { readonly kind: "keep" }
	| { readonly kind: "close" }
	| { readonly kind: "show"; readonly url: string };

/**
 * Where the sign-in stands once a phase is published: pending while Codex
 * waits on the provider, ended when that goes back to signed out, and clear
 * once there is an account.
 * @param phase The phase.
 * @param progress Where it stood.
 * @returns Where it stands.
 */
function signInAfter(phase: AgentPhase, progress: SignInProgress): SignInProgress {
	if (phase.kind === "signing_in") return "pending";
	if (phase.kind === "starting" || phase.kind === "ready") return "none";
	return phase.kind === "signed_out" && progress === "pending" ? "ended" : progress;
}

/**
 * Why a sign-in ended without an account.
 * @param phase The phase it ended in.
 * @returns Codex's reason, or that it did not finish.
 */
function signInEnded(phase: AgentPhase): string {
	return (phase.kind === "signed_out" ? phase.failure : null) ?? SIGN_IN_UNFINISHED;
}

/**
 * What to do with a gesture's tab: show the provider's page once Codex names
 * it, keep it while a sign-in is on its way to naming one, and close it
 * otherwise.
 * @param phase The phase.
 * @param progress Where the sign-in stands.
 * @returns The tab's fate.
 */
function tabFate(phase: AgentPhase, progress: SignInProgress): TabFate {
	if (phase.kind === "signing_in") {
		return phase.authUrl === null ? { kind: "keep" } : { kind: "show", url: phase.authUrl };
	}
	const onItsWay =
		phase.kind === "connecting" || (phase.kind === "signed_out" && progress === "asked");
	return { kind: onItsWay ? "keep" : "close" };
}

export { signInAfter, signInEnded, tabFate, type SignInProgress };
