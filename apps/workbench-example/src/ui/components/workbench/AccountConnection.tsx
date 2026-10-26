import { useCallback } from "react";
import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import { useVoiceClient, useVoiceState } from "@archboard/codex-realtime-voice/react";

/**
 * Keep sign-in separate from the two conversation owners.
 * @returns The rendered controls or content.
 */
function AccountConnection() {
	const state = useVoiceState();
	const snapshot = state.server;
	if (snapshot?.account.state === "ready") return null;
	const login = snapshot === null ? null : snapshot.login;
	return (
		<section className="sign-in" aria-label="Codex sign-in">
			<h2>Connect your Codex account</h2>
			<p>This application keeps its own private sign-in.</p>
			<LoginActions login={login} disabled={state.busy || state.connection !== "connected"} />
			<AccountProblem snapshot={snapshot} />
		</section>
	);
}

/**
 * Show an actionable account failure.
 * @param props The rendered state and its action owners.
 * @param props.snapshot The current server projection.
 * @returns The rendered controls or content.
 */
function AccountProblem({ snapshot }: { readonly snapshot: BrowserSnapshot | null }) {
	if (snapshot?.account.state !== "failed") return null;
	return <p role="alert">{snapshot.account.reason}</p>;
}

/**
 * Keep the login URL and cancellation tied to the current pending login.
 * @param props The rendered state and its action owners.
 * @param props.login The current sign-in state.
 * @param props.disabled Whether these controls are unavailable.
 * @returns The rendered controls or content.
 */
function LoginActions({
	login,
	disabled,
}: {
	readonly login: BrowserSnapshot["login"] | null;
	readonly disabled: boolean;
}) {
	const client = useVoiceClient();
	const signIn = useCallback(() => {
		void client.signIn();
	}, [client]);
	const cancel = useCallback(() => {
		void client.cancelSignIn();
	}, [client]);
	const refresh = useCallback(() => {
		void client.refresh();
	}, [client]);
	if (login?.state !== "pending")
		return (
			<button disabled={disabled} onClick={signIn}>
				Sign in with ChatGPT
			</button>
		);
	return (
		<div className="actions">
			{login.authUrl && (
				<a href={login.authUrl} target="_blank" rel="noreferrer">
					Continue sign-in
				</a>
			)}
			<button disabled={disabled} onClick={cancel}>
				Cancel sign-in
			</button>
			<button disabled={disabled} onClick={refresh}>
				I finished signing in
			</button>
		</div>
	);
}

export { AccountConnection };
