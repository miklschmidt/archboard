// Which way of reading this variant the pane is showing.
//
// A board can be explained more than once — the parts and how they are
// wired, one exchange between them in order — over the same nodes. Switching
// between those is reading, not editing: it changes what this pane asks the
// server to draw and nothing else. No board is written, no version moves, and
// the other pane showing the other view is unaffected (ADR 0023).
//
// The whole variant is always one of the choices, and it is first. Without it a
// board whose views are all narrow would have no way back to itself: a person
// who picked one would be stuck inside it, and the board as a whole — the thing
// every view is a reading of — would be the one thing they could not see.
//
// The bar is absent entirely when a board names no views. Offering
// a choice between the whole board and nothing else is furniture.
//
// A button says the view's name and nothing else. The grammar a view is drawn
// in used to be written under it, and a person naming their views the obvious
// way got "The parts the parts" and "One write in order in order" — the note
// repeating the name they had just chosen. The picture already says which
// grammar it is, in the clearest way available: by being that picture.

import { useCallback, type JSX } from "react";

import { Button } from "@/ui/components/button";
import type { SemanticOfferedView } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** Inputs for the view bar. */
interface SemanticViewBarProps {
	/** Every view this board offers, in the order it states them. */
	views: readonly SemanticOfferedView[];
	/** The view on screen, or null when the whole variant is drawn. */
	showing: SemanticOfferedView | null;
	/**
	 * The person chose a way of reading this variant.
	 * @param view The view's id, or null for the whole variant.
	 */
	onChoose: (view: string | null) => void;
}

/** The choice that is not a view: the variant, whole. */
const WHOLE_VARIANT: SemanticOfferedView = Object.freeze({
	id: "",
	name: "Everything",
	grammar: "architecture",
});

/** One button in the bar. */
interface ViewButtonProps {
	view: SemanticOfferedView;
	showing: boolean;
	/**
	 * The person chose this view.
	 * @param view The view's id, or null for the whole variant.
	 */
	onChoose: (view: string | null) => void;
}

/**
 * One view's button.
 * @param props The view, whether it is on screen, and what to do when chosen.
 * @returns The button.
 */
function ViewButton(props: ViewButtonProps): JSX.Element {
	const { view, showing, onChoose } = props;
	const choose = useCallback((): void => {
		// The whole variant is a choice with no view behind it, so it says so with
		// the absence the rest of the contract already spells as null.
		onChoose(view.id === "" ? null : view.id);
	}, [onChoose, view.id]);
	return (
		<Button
			type="button"
			variant={showing ? "secondary" : "ghost"}
			size="sm"
			aria-pressed={showing}
			data-slot="semantic-view-choice"
			data-semantic-view={view.id}
			onClick={choose}
		>
			{view.name}
		</Button>
	);
}

/**
 * The ways this variant can be read, and which one is on screen.
 * @param props The views, the one showing, and what to do when one is chosen.
 * @returns The bar, or null when there is nothing to choose between.
 */
function SemanticViewBar(props: SemanticViewBarProps): JSX.Element | null {
	const { views, showing, onChoose } = props;
	if (views.length === 0) {
		return null;
	}
	return (
		<fieldset
			data-slot="semantic-view-bar"
			aria-label="Ways of reading this board"
			className="flex shrink-0 items-center gap-1 border-0 p-0"
		>
			<ViewButton view={WHOLE_VARIANT} showing={showing === null} onChoose={onChoose} />
			{views.map((view) => (
				<ViewButton
					key={view.id}
					view={view}
					showing={showing?.id === view.id}
					onChoose={onChoose}
				/>
			))}
		</fieldset>
	);
}

export { SemanticViewBar, type SemanticViewBarProps };
