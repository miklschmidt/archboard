// Which state of the architecture this pane is showing.
//
// A board holds a family of variants: the current architecture, the drafts
// proposed against it, and the states that used to be current. They are the
// same board, and moving between them is reading — no board is written, no
// version moves, and the other pane goes on showing whatever it was showing
// (ADR 0023). Two panes showing two variants of one board side by side is the
// whole point of proposing a change.
//
// Each button says the variant's name and where it stands, because those are
// different questions and a name alone answers neither: "Semantic boards" does
// not say whether it is the architecture or a suggestion about it, and nothing
// else on screen does either. The lifecycle is the second line rather than a
// badge, so the bar stays one row high beside the views.
//
// A board with one variant offers no choice, for the reason the view bar
// offers none when a variant has no views: a choice between one thing and
// nothing is furniture. It still says which state is on screen, though, because
// that is a different question from "what else could I read" — somebody who
// followed a link into another board's "as built" has to be able to see that
// that is what they are looking at, and a picker with one button in it is not
// the way to tell them.

import { useCallback, type JSX } from "react";

import { Button } from "@/ui/components/button";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";

/** Inputs for the variant bar. */
interface SemanticVariantBarProps {
	/** Every variant of this board, in the order the board states them. */
	variants: readonly OfferedVariant[];
	/** The one on screen, by id, or null while that is not yet known. */
	showing: string | null;
	/**
	 * The person chose a state of this architecture.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	onChoose: (variant: string | null) => void;
}

/** One variant's button. */
interface VariantButtonProps {
	/** The variant it offers. */
	variant: OfferedVariant;
	/** Whether it is the one on screen. */
	showing: boolean;
	/**
	 * The person chose it.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	onChoose: (variant: string | null) => void;
}

/**
 * One state of the architecture, as a button.
 * @param props The variant, whether it is on screen, and what a choice does.
 * @returns The button.
 */
function VariantButton(props: VariantButtonProps): JSX.Element {
	const { variant, showing, onChoose } = props;
	const choose = useCallback((): void => {
		// The current variant is asked for as the absence of a variant, which is
		// what an address with no variant in it already means. Naming it by id
		// instead would pin a pane to a state that stops being current the moment
		// somebody adopts a proposal.
		onChoose(variant.lifecycle === "current" ? null : variant.id);
	}, [onChoose, variant.id, variant.lifecycle]);
	return (
		<Button
			type="button"
			variant={showing ? "secondary" : "ghost"}
			size="sm"
			aria-pressed={showing}
			data-slot="semantic-variant-choice"
			data-semantic-variant={variant.id}
			data-semantic-lifecycle={variant.lifecycle}
			className="h-auto flex-col items-start gap-0 py-1"
			onClick={choose}
		>
			<span className="text-body">{variant.name}</span>
			<span className="text-kicker text-muted-foreground uppercase">{variant.lifecycle}</span>
		</Button>
	);
}

/**
 * The one state a board has, said rather than offered.
 *
 * The same two lines a button carries, without being a control: nothing here
 * can be chosen, because there is nothing else to choose.
 * @param props The variant on screen.
 * @param props.variant That variant.
 * @returns The label.
 */
function VariantStanding(props: { readonly variant: OfferedVariant }): JSX.Element {
	const { variant } = props;
	return (
		<p
			data-slot="semantic-variant-showing"
			data-semantic-variant={variant.id}
			data-semantic-lifecycle={variant.lifecycle}
			className="flex shrink-0 flex-col items-start gap-0 px-2 py-1"
		>
			<span className="text-body">{variant.name}</span>
			<span className="text-kicker text-muted-foreground uppercase">{variant.lifecycle}</span>
		</p>
	);
}

/**
 * The states of this architecture, and which one is on screen.
 * @param props The variants, the one showing, and what a choice does.
 * @returns The bar, the one state said plainly, or null when there is none.
 */
function SemanticVariantBar(props: SemanticVariantBarProps): JSX.Element | null {
	const { variants, showing, onChoose } = props;
	if (variants.length < 2) {
		const only = variants[0];
		return only === undefined ? null : <VariantStanding variant={only} />;
	}
	return (
		<fieldset
			data-slot="semantic-variant-bar"
			aria-label="States of this architecture"
			className="flex shrink-0 items-center gap-1 border-0 p-0"
		>
			{variants.map((variant) => (
				<VariantButton
					key={variant.id}
					variant={variant}
					showing={showing === variant.id}
					onChoose={onChoose}
				/>
			))}
		</fieldset>
	);
}

export { SemanticVariantBar, type SemanticVariantBarProps };
