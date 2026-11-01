// A conversation with nothing in it yet: what the agent reads, and a few
// things worth asking. A suggestion only fills the composer; it never sends.

import { useCallback, type JSX } from "react";

/** Questions about the reading in view. */
const SUGGESTIONS = [
	"Explain this reading",
	"What does this architecture get wrong?",
	"Check this architecture against the code",
] as const;

/** Inputs for the empty state. */
interface EmptyConversationProps {
	readonly suggest: (text: string) => void;
}

/**
 * A conversation with nothing in it yet.
 * @param props The suggestion handler.
 * @returns The empty state.
 */
function EmptyConversation(props: EmptyConversationProps): JSX.Element {
	return (
		<section data-slot="conversation-empty" className="my-auto flex flex-col gap-4 px-1 py-8">
			<div className="flex flex-col gap-1">
				<h3 className="text-title">Ask the agent</h3>
				<p className="text-body text-muted-foreground">
					Ask about the focused reading and your selection. The agent can explain the architecture,
					inspect its code evidence, or propose a change.
				</p>
			</div>
			<ul className="flex flex-col gap-1">
				{SUGGESTIONS.map((text) => (
					<Suggestion key={text} text={text} suggest={props.suggest} />
				))}
			</ul>
		</section>
	);
}

/**
 * One suggestion.
 * @param props The words and the handler.
 * @param props.text The suggestion.
 * @param props.suggest Put it in the composer.
 * @returns The suggestion.
 */
function Suggestion(props: {
	readonly text: string;
	readonly suggest: (text: string) => void;
}): JSX.Element {
	const { text, suggest } = props;
	const handleClick = useCallback(() => suggest(text), [suggest, text]);
	return (
		<li>
			<button
				type="button"
				onClick={handleClick}
				className="text-control border-border hover:bg-muted rounded-control w-full border px-3 py-1.5 text-left font-normal"
			>
				{text}
			</button>
		</li>
	);
}

export { EmptyConversation, type EmptyConversationProps };
