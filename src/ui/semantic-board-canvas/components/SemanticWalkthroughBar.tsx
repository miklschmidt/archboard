// The explanations this variant gives of itself, offered beside the board’s shared views.
//
// A walkthrough is a reading, like a view: choosing one opens a rail beside the
// diagram and changes nothing else. No board is written, no version moves, and
// the other pane showing this board is unaffected (ADR 0023).
//
// A variant that states no walkthrough is offered nothing — no rail, no empty
// bar, no control that would only ever be disabled — and that is decided in one
// place, by the strip that would hold this bar. Deciding it here as well would
// mean two answers to one question, and a viewer that grew an empty strip would
// still pass whichever of them was left.
//
// Choosing the one already open closes it, which is what the pressed state
// already says: the button is the explanation's presence on screen, and pressing
// it again is how anything pressed is let go.

import { useCallback, type JSX } from "react";

import type { SemanticWalkthrough } from "@/shared/semantic-board/index";
import { Button } from "@/ui/components/button";

/** Inputs for the walkthrough bar. */
interface SemanticWalkthroughBarProps {
	/** Every explanation this variant states, in the order it states them. */
	walkthroughs: readonly SemanticWalkthrough[];
	/** The one being read, or null when none is. */
	open: string | null;
	/**
	 * The person chose an explanation, or closed the one they were reading.
	 * @param walkthrough The walkthrough's id, or null for none.
	 */
	onChoose: (walkthrough: string | null) => void;
}

/** One walkthrough's button. */
interface WalkthroughButtonProps {
	/** The explanation it offers. */
	walkthrough: SemanticWalkthrough;
	/** Whether it is the one being read. */
	open: boolean;
	/**
	 * The person pressed it.
	 * @param walkthrough The walkthrough's id, or null to close it.
	 */
	onChoose: (walkthrough: string | null) => void;
}

/**
 * One explanation's button.
 * @param props The walkthrough, whether it is open, and what to do when pressed.
 * @returns The button.
 */
function WalkthroughButton(props: WalkthroughButtonProps): JSX.Element {
	const { walkthrough, open, onChoose } = props;
	const choose = useCallback((): void => {
		onChoose(open ? null : walkthrough.id);
	}, [onChoose, open, walkthrough.id]);
	return (
		<Button
			type="button"
			variant={open ? "secondary" : "ghost"}
			size="sm"
			aria-pressed={open}
			data-slot="semantic-walkthrough-choice"
			data-semantic-walkthrough={walkthrough.id}
			onClick={choose}
		>
			{walkthrough.name}
		</Button>
	);
}

/**
 * The explanations this variant offers, and which one is being read.
 * @param props The walkthroughs, the open one, and what a choice does.
 * @returns The bar. The strip above the diagram decides whether there is one.
 */
function SemanticWalkthroughBar(props: SemanticWalkthroughBarProps): JSX.Element {
	const { walkthroughs, open, onChoose } = props;
	return (
		<fieldset
			data-slot="semantic-walkthrough-bar"
			aria-label="Explanations of this board"
			className="ml-auto flex shrink-0 items-center gap-1 border-0 p-0"
		>
			{/* Named for a screen reader by the fieldset's own label, and by nothing
			    visible. The other bars beside it offer their choices without a word
			    over them, and a label that only this one has reads as a heading for
			    the whole strip rather than for the three buttons after it. */}
			<legend className="sr-only">Explanations of this board</legend>
			{walkthroughs.map((walkthrough) => (
				<WalkthroughButton
					key={walkthrough.id}
					walkthrough={walkthrough}
					open={open === walkthrough.id}
					onChoose={onChoose}
				/>
			))}
		</fieldset>
	);
}

export { SemanticWalkthroughBar, type SemanticWalkthroughBarProps };
