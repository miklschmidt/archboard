import { useCallback } from "react";
import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import type { ExampleClient, ExampleClientSnapshot } from "#ui/clients/workbench/client.ts";

/**
 * Keep sign-in separate from the two conversation owners.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function AccountConnection({
	client,
	state,
}: {
	readonly client: ExampleClient;
	readonly state: ExampleClientSnapshot;
}) {
	const snapshot = state.transport.snapshot;
	if (snapshot?.account.state === "ready") return null;
	const login = snapshot === null ? null : snapshot.login;
	return (
		<section className="sign-in" aria-label="Codex sign-in">
			<h2>Connect your Codex account</h2>
			<p>This application keeps its own private sign-in.</p>
			<LoginActions
				client={client}
				login={login}
				disabled={state.busy || state.transport.connection !== "connected"}
			/>
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
 * @param props.client The shared connection and media client.
 * @param props.login The current sign-in state.
 * @param props.disabled Whether these controls are unavailable.
 * @returns The rendered controls or content.
 */
function LoginActions({
	client,
	login,
	disabled,
}: {
	readonly client: ExampleClient;
	readonly login: BrowserSnapshot["login"] | null;
	readonly disabled: boolean;
}) {
	const signIn = useCallback(() => {
		void client.login();
	}, [client]);
	const cancel = useCallback(() => {
		void client.cancelLogin();
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
