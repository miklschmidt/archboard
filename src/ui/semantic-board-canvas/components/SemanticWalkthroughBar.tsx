// The explanations this variant gives of itself, offered in the sidebar beside the board’s shared views.
//
// A walkthrough is a reading, like a view: choosing one opens a rail beside the
// diagram and changes nothing else. No board is written, no version moves, and
// the other pane showing this board is unaffected (ADR 0023).
//
// A variant that states no walkthrough is offered nothing — no rail, no empty
// list, no control that would only ever be disabled — and that is decided in one
// place, by the sidebar panel that would hold this list. Deciding it here as well would
// mean two answers to one question, and a viewer that grew an empty strip would
// still pass whichever of them was left.
//
// Choosing the one already open closes it, which is what the pressed state
// already says: the button is the explanation's presence on screen, and pressing
// it again is how anything pressed is let go.

import { RiMicLine } from "@remixicon/react";
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
	/**
	 * Have an explanation narrated aloud, when the shell can start voice for this pane. Offered
	 * here, beside each explanation, so a narration can be started without first opening it.
	 * @param walkthrough The walkthrough's id.
	 */
	onNarrate?: ((walkthrough: string) => void) | undefined;
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
	/** Have it narrated, when the shell can. */
	onNarrate: ((walkthrough: string) => void) | undefined;
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
	const { onNarrate } = props;
	// The server opens the explanation on its first step once voice is starting, so the voice is
	// handed the step it arrived on.
	const narrate = useCallback((): void => {
		onNarrate?.(walkthrough.id);
	}, [onNarrate, walkthrough.id]);
	return (
		<div className="flex items-center gap-0.5">
			<Button
				type="button"
				variant={open ? "secondary" : "ghost"}
				size="sm"
				aria-pressed={open}
				data-slot="semantic-walkthrough-choice"
				data-semantic-walkthrough={walkthrough.id}
				className="min-w-0 flex-1 justify-start"
				onClick={choose}
			>
				<span className="truncate">{walkthrough.name}</span>
			</Button>
			{onNarrate !== undefined && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					data-slot="semantic-walkthrough-narrate"
					aria-label={`Narrate ${walkthrough.name}`}
					title="Narrate aloud"
					onClick={narrate}
				>
					<RiMicLine />
				</Button>
			)}
		</div>
	);
}

/**
 * The explanations this variant offers, and which one is being read.
 * @param props The walkthroughs, the open one, and what a choice does.
 * @returns The list. The sidebar decides whether there is one.
 */
function SemanticWalkthroughBar(props: SemanticWalkthroughBarProps): JSX.Element {
	const { walkthroughs, open, onChoose, onNarrate } = props;
	return (
		<fieldset
			data-slot="semantic-walkthrough-bar"
			aria-label="Explanations of this board"
			// A fieldset is as wide as its longest line unless told otherwise, which pushes the
			// narrate button out of the sidebar instead of truncating the name.
			className="flex min-w-0 flex-col items-stretch gap-0.5 border-0 p-0"
		>
			<legend className="sr-only">Explanations of this board</legend>
			{walkthroughs.map((walkthrough) => (
				<WalkthroughButton
					key={walkthrough.id}
					walkthrough={walkthrough}
					open={open === walkthrough.id}
					onChoose={onChoose}
					onNarrate={onNarrate}
				/>
			))}
		</fieldset>
	);
}

export { SemanticWalkthroughBar, type SemanticWalkthroughBarProps };
