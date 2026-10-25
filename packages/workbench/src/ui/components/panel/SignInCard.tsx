// The other way to sign in, where the conversation will be: an OpenAI API
// key. Signing in with ChatGPT, its pending page and its cancel live in the
// agent dock's status line, the one place the sign-in state is said.

import { useCallback, useState, type ChangeEvent, type FormEvent, type JSX } from "react";

import { Button } from "@archboard/ui-kit/components";
import type { AgentActions } from "#ui/state/surfaces/contracts.ts";

/** Inputs for the card. */
interface SignInCardProps {
	readonly actions: AgentActions;
}

/**
 * Signing in with an API key, beside the bar's ChatGPT sign-in.
 * @param props The actions.
 * @returns The card.
 */
function SignInCard(props: SignInCardProps): JSX.Element {
	const { actions } = props;
	const [apiKey, setApiKey] = useState("");
	const changeKey = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value),
		[],
	);
	const submitKey = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (apiKey.trim() !== "") actions.signIn({ type: "apiKey", apiKey: apiKey.trim() });
		},
		[actions, apiKey],
	);
	return (
		<section data-slot="sign-in" className="my-auto flex flex-col gap-3 px-1 py-8">
			<p className="text-body text-muted-foreground">
				Archboard keeps its own Codex sign-in, apart from any Codex you use elsewhere. Sign in with
				ChatGPT from the bar below, or with an OpenAI API key here.
			</p>
			<form onSubmit={submitKey} className="flex gap-1.5">
				<label htmlFor="agent-api-key" className="sr-only">
					OpenAI API key
				</label>
				<input
					id="agent-api-key"
					type="password"
					autoComplete="off"
					value={apiKey}
					onChange={changeKey}
					placeholder="sk-…"
					className="border-border bg-background text-control focus:border-ring/60 rounded-control h-8 min-w-0 flex-1 border px-2.5 font-mono outline-none"
				/>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					className="rounded-control h-8 px-3"
					disabled={apiKey.trim() === ""}
				>
					Use key
				</Button>
			</form>
		</section>
	);
}

export { SignInCard, type SignInCardProps };
