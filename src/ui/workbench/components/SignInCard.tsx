// Signing in, where the conversation will be: continue with ChatGPT, or use
// an API key. Archboard keeps its own Codex sign-in, separate from any Codex
// the person uses elsewhere. While a sign-in waits on the provider's page, the
// page is one click away and the sign-in can be cancelled.

import { useCallback, useState, type ChangeEvent, type FormEvent, type JSX } from "react";

import { Button } from "@/ui/components/button";
import type { AgentActions, AgentView } from "@/ui/workbench/contracts";

/** Inputs for the card. */
interface SignInCardProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
}

/**
 * Signing in.
 * @param props The view and the actions.
 * @returns The card.
 */
function SignInCard(props: SignInCardProps): JSX.Element {
	const { view, actions } = props;
	const { phase } = view.setup;
	const [apiKey, setApiKey] = useState("");
	const chatgpt = useCallback(() => actions.signIn({ type: "chatgpt" }), [actions]);
	const changeKey = useCallback((event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value), []);
	const submitKey = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (apiKey.trim() !== "") actions.signIn({ type: "apiKey", apiKey: apiKey.trim() });
		},
		[actions, apiKey],
	);
	const pending = phase.kind === "signing_in";
	return (
		<section data-slot="sign-in" className="my-auto flex flex-col gap-4 px-1 py-8">
			<div className="flex flex-col gap-1">
				<h3 className="text-title">Sign in to use the agent</h3>
				<p className="text-body text-muted-foreground">
					Archboard keeps its own Codex sign-in, apart from any Codex you use elsewhere.
				</p>
			</div>
			{phase.kind === "signed_out" && phase.failure !== null && (
				<p className="text-body text-destructive">{phase.failure}</p>
			)}
			{view.setup.failure !== null && <p className="text-body text-destructive">{view.setup.failure}</p>}
			{pending ? (
				<div className="flex items-center gap-2">
					{phase.authUrl !== null && (
						<a
							href={phase.authUrl}
							target="_blank"
							rel="noreferrer"
							className="bg-primary text-primary-foreground text-control flex h-8 items-center rounded-[3px] px-3 font-medium"
						>
							Open the ChatGPT page
						</a>
					)}
					<Button variant="ghost" size="sm" className="h-8 rounded-[3px]" onClick={actions.cancelSignIn}>
						Cancel
					</Button>
				</div>
			) : (
				<Button className="h-8 self-start rounded-[3px] px-3" onClick={chatgpt}>
					Continue with ChatGPT
				</Button>
			)}
			<form onSubmit={submitKey} className="flex flex-col gap-1.5">
				<label htmlFor="agent-api-key" className="text-body text-muted-foreground">
					Or use an OpenAI API key
				</label>
				<div className="flex gap-1.5">
					<input
						id="agent-api-key"
						type="password"
						autoComplete="off"
						value={apiKey}
						onChange={changeKey}
						placeholder="sk-…"
						className="border-border bg-background text-control focus:border-ring/60 h-8 min-w-0 flex-1 rounded-[3px] border px-2.5 font-mono outline-none"
					/>
					<Button type="submit" variant="outline" size="sm" className="h-8 rounded-[3px] px-3" disabled={apiKey.trim() === ""}>
						Sign in
					</Button>
				</div>
			</form>
		</section>
	);
}

export { SignInCard, type SignInCardProps };
