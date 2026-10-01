// A conversation with nothing in it yet: what the agent reads, and a few
// things worth asking. A suggestion only fills the composer; it never sends.

import { useCallback, type JSX } from "react";

import type { AgentView } from "@/ui/workbench/contracts";

/** Things worth asking about the board in view. */
const SUGGESTIONS = [
	"Explain this board",
	"What does this architecture get wrong?",
	"Check the board against the code",
] as const;

/** Inputs for the empty state. */
interface EmptyConversationProps {
	readonly view: AgentView;
	readonly suggest: (text: string) => void;
}

/**
 * A conversation with nothing in it yet.
 * @param props The view and the suggestion handler.
 * @returns The empty state.
 */
function EmptyConversation(props: EmptyConversationProps): JSX.Element {
	const { board } = props.view.context;
	return (
		<section data-slot="conversation-empty" className="my-auto flex flex-col gap-4 px-1 py-8">
			<div className="flex flex-col gap-1">
				<h3 className="text-title">{board === null ? "Ask the agent" : `Ask about ${board}`}</h3>
				<p className="text-body text-muted-foreground">
					The agent reads the board in the focused pane, and what you picked out on it. It can
					explain the architecture, check it against the code, or propose a change as a new state of
					the board.
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
