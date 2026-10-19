// Which way of reading this variant the pane is showing.
//
// A board can be explained more than once — the parts and how they are
// wired, one exchange between them in order — over the same nodes. Switching
// between those is reading, not editing: it changes what this pane asks the
// server to draw and nothing else. No board is written, no version moves, and
// the other pane showing the other view is unaffected (ADR 0023).
//
// Two readings are on every board, because nobody authors them (ADR 0052).
// The overview is what a board opens on, and it is first: the parts that work
// together, with the rest closed. Everything is last and dimmed: it is the way
// back to every part at once, which no narrow view gives, but it is the
// reading a person should reach for least.
//
// A choice says the view's name and nothing else. The grammar a view is drawn
// in used to be written under it, and a person naming their views the obvious
// way got "The parts the parts" and "One write in order in order" — the note
// repeating the name they had just chosen. The picture already says which
// grammar it is, in the clearest way available: by being that picture. What
// the view on screen answers is different: its author wrote it to say why the
// reading exists, so it stands under the view's name while that view is on
// screen, next to the choice that put it there (TASK-383).

import { useCallback, type JSX } from "react";

import { EVERYTHING_VIEW } from "@archboard/board/views";
import type { SemanticOfferedView } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarLabel,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";

/** Inputs for the view bar. */
interface SemanticViewBarProps {
	/** Every view this board offers, in the order it states them. */
	views: readonly SemanticOfferedView[];
	/** The view on screen, or null when the overview is drawn. */
	showing: SemanticOfferedView | null;
	/** What the view on screen answers, when its author said. */
	summary: string | undefined;
	/**
	 * The person chose a way of reading this variant.
	 * @param view The view's id, or null for the overview.
	 */
	onChoose: (view: string | null) => void;
}

/** The choice that is not a view: the overview, which the board opens on. */
const OVERVIEW: SemanticOfferedView = Object.freeze({
	id: "",
	name: "Overview",
	grammar: "architecture",
});

/** Every part and every relationship, offered as the view of that name. */
const EVERYTHING: SemanticOfferedView = Object.freeze({
	id: EVERYTHING_VIEW.id,
	name: EVERYTHING_VIEW.name,
	grammar: EVERYTHING_VIEW.grammar,
});

/** One view's choice. */
interface ViewChoiceProps {
	view: SemanticOfferedView;
	showing: boolean;
	/** Whether its name is dimmed, as the reading to reach for least. */
	quiet: boolean;
	/**
	 * The person chose this view.
	 * @param view The view's id, or null for the overview.
	 */
	onChoose: (view: string | null) => void;
}

/**
 * One view's choice.
 * @param props The view, whether it is on screen, and what to do when chosen.
 * @returns The choice.
 */
function ViewChoice(props: ViewChoiceProps): JSX.Element {
	const { view, showing, quiet, onChoose } = props;
	const choose = useCallback((): void => {
		// The overview is a choice with no view behind it, so it says so with the
		// absence the rest of the contract already spells as null.
		onChoose(view.id === "" ? null : view.id);
	}, [onChoose, view.id]);
	return (
		<SidebarChoice
			pressed={showing}
			data-slot="semantic-view-choice"
			data-semantic-view={view.id}
			onClick={choose}
		>
			<SidebarLabel>
				{quiet ? <span className="text-muted-foreground">{view.name}</span> : view.name}
			</SidebarLabel>
		</SidebarChoice>
	);
}

/**
 * The ways this variant can be read, and which one is on screen.
 * @param props The views, the one showing, and what to do when one is chosen.
 * @returns The list.
 */
function SemanticViewBar(props: SemanticViewBarProps): JSX.Element {
	const { views, showing, summary, onChoose } = props;
	return (
		<SidebarChoices slot="semantic-view-bar" label="Ways of reading this board">
			{[OVERVIEW, ...views, EVERYTHING].map((view) => {
				const on = view.id === "" ? showing === null : showing?.id === view.id;
				return (
					<div key={view.id} className="flex flex-col">
						<ViewChoice view={view} showing={on} quiet={view === EVERYTHING} onChoose={onChoose} />
						{on && summary !== undefined && (
							<p
								data-slot="semantic-view-summary"
								className="text-body text-muted-foreground px-2 pt-1 pb-2"
							>
								{summary}
							</p>
						)}
					</div>
				);
			})}
		</SidebarChoices>
	);
}

export { SemanticViewBar, type SemanticViewBarProps };
