// The explanations this variant gives of itself, offered in the sidebar above
// the board's shared views.
//
// A walkthrough is a reading, like a view: choosing one presents it over the
// diagram and changes nothing else. No board is written, no version moves, and
// the other pane showing this board is unaffected (ADR 0023).
//
// It comes before the views because it is the author's way in: a first reader
// takes the explanation, then reads on their own (TASK-383). A row therefore
// says what it does before what it is called: the mark that it plays, the whole
// name, and how many steps it takes, which is what a reader weighs before
// starting one. The mark is a play button, not a bare triangle: a triangle
// beside a name is how a row says it folds open, and nothing in a row does.
//
// Narrating one is offered beside the row, in a slot of its own that is there in
// every pane whenever the shell can narrate, so a row is the same size and
// holds its place whichever pane is active and whatever voice is doing. While
// a narration cannot start, the control is dimmed and says why.
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

import { RiMicLine, RiPlayCircleLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { SemanticWalkthrough } from "@archboard/board/content";
import { IconButton } from "@archboard/ui-kit/components";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarLabel,
	SidebarMeta,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";

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
	 * Narrating an explanation aloud, when the shell can start voice for this pane. Offered
	 * here, beside each explanation, so a narration can be started without first opening it.
	 */
	narration?: WalkthroughNarration | undefined;
}

/** One walkthrough's row. */
interface WalkthroughRowProps {
	/** The explanation it offers. */
	walkthrough: SemanticWalkthrough;
	/** Whether it is the one being read. */
	open: boolean;
	/**
	 * The person pressed it.
	 * @param walkthrough The walkthrough's id, or null to close it.
	 */
	onChoose: (walkthrough: string | null) => void;
	/** Narrating it, when the shell can. */
	narration: WalkthroughNarration | undefined;
}

/**
 * How long an explanation is, in the words a reader weighs it by.
 * @param walkthrough The explanation.
 * @returns Its number of steps.
 */
function lengthOf(walkthrough: SemanticWalkthrough): string {
	const steps = walkthrough.beats.length;
	return steps === 1 ? "1 step" : `${steps} steps`;
}

/**
 * One explanation's row: the choice that presents it, and narrating it beside.
 * @param props The walkthrough, whether it is open, and what to do when pressed.
 * @returns The row.
 */
function WalkthroughRow(props: WalkthroughRowProps): JSX.Element {
	const { walkthrough, open, onChoose } = props;
	const choose = useCallback((): void => {
		onChoose(open ? null : walkthrough.id);
	}, [onChoose, open, walkthrough.id]);
	const { narration } = props;
	// The server opens the explanation on its first step once voice is starting, so the voice is
	// handed the step it arrived on.
	const narrate = useCallback((): void => {
		narration?.start(walkthrough.id);
	}, [narration, walkthrough.id]);
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
			<SidebarChoice
				pressed={open}
				data-slot="semantic-walkthrough-choice"
				data-semantic-walkthrough={walkthrough.id}
				onClick={choose}
			>
				<SidebarGlyph>
					<RiPlayCircleLine className="text-muted-foreground size-4" />
				</SidebarGlyph>
				<SidebarLabel>
					{walkthrough.name} <SidebarMeta>{lengthOf(walkthrough)}</SidebarMeta>
				</SidebarLabel>
			</SidebarChoice>
			{narration !== undefined && (
				<IconButton
					label={`Narrate ${walkthrough.name}`}
					tip="Narrate aloud"
					held={narration.held}
					slot="semantic-walkthrough-narrate"
					onClick={narrate}
				>
					<RiMicLine />
				</IconButton>
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
	const { walkthroughs, open, onChoose, narration } = props;
	return (
		<SidebarChoices slot="semantic-walkthrough-bar" label="Explanations of this board">
			{walkthroughs.map((walkthrough) => (
				<WalkthroughRow
					key={walkthrough.id}
					walkthrough={walkthrough}
					open={open === walkthrough.id}
					onChoose={onChoose}
					narration={narration}
				/>
			))}
		</SidebarChoices>
	);
}

export { SemanticWalkthroughBar, type SemanticWalkthroughBarProps };
