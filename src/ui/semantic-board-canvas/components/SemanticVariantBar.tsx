// Which variant of a board a level down this pane is showing.
//
// A board holds a family of variants: the current architecture, the drafts
// proposed against it, and the variants that used to be current. They are the
// same board, and moving between them is reading — no board is written, no
// version moves, and the other pane goes on showing whatever it was showing
// (ADR 0023). The navigator offers the variants of the pane's own board; a
// board somebody followed a drill-down into is not in it, so its variants are
// offered here instead.
//
// A variant is said here the way the navigator and the header say it
// (`@/ui/variant-lifecycle`): its lifecycle's mark before its name, the
// variants the board has moved past receding, and the same order — the one the
// board's name opens, the other live ones, then the receding ones newest
// first. The lifecycle is in the row's title and its accessible name, because a
// mark alone does not say it to everyone.
//
// The receding variants are not gathered behind an Earlier row, as the
// navigator gathers them. The navigator has to stay readable at hundreds of
// boards; this list is one board's, at most six variants on any board, and it
// is the only place a drilled board's variants can be chosen, so hiding some of
// them would cost a click on the one surface that offers them. They come last
// and recede, which is what the Earlier row does in the navigator.
//
// A board with one variant offers no choice, for the reason the view bar
// offers none when a board has no views: a choice between one thing and
// nothing is furniture. It still says which variant is on screen, though,
// because that is a different question from "what else could I read" —
// somebody who followed a link into another board's "as built" has to be able
// to see that that is what they are looking at.

import { useCallback, type JSX } from "react";

import { cn } from "@/ui/components/class-names";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarLabel,
	SidebarRow,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";
import { VariantMark, variantOrder, variantRecedes } from "@/ui/variant-lifecycle";

/** Inputs for the variant bar. */
interface SemanticVariantBarProps {
	/** Every variant of this board, in the order the board states them. */
	variants: readonly OfferedVariant[];
	/** The one on screen, by id, or null while that is not yet known. */
	showing: string | null;
	/** The one the board's name opens, by id, or null when it opens none. */
	opens: string | null;
	/**
	 * The person chose a variant of this board.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	onChoose: (variant: string | null) => void;
}

/** One variant's choice. */
interface VariantChoiceProps {
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
 * What a variant row says to somebody who cannot see its mark.
 * @param variant The variant.
 * @returns Its name and lifecycle.
 */
function spoken(variant: OfferedVariant): string {
	return `${variant.name}, ${variant.lifecycle}`;
}

/**
 * A variant's name, receding when the board has moved past it, unless it is
 * the one on screen.
 * @param props The variant and whether it is on screen.
 * @param props.variant The variant.
 * @param props.showing Whether it is on screen.
 * @returns The name.
 */
function VariantName(props: {
	readonly variant: OfferedVariant;
	readonly showing: boolean;
}): JSX.Element {
	const recedes = variantRecedes(props.variant.lifecycle) && !props.showing;
	return (
		<SidebarLabel>
			<span className={cn(recedes && "text-muted-foreground")}>{props.variant.name}</span>
		</SidebarLabel>
	);
}

/**
 * One variant, as a choice.
 * @param props The variant, whether it is on screen, and what a choice does.
 * @returns The choice.
 */
function VariantChoice(props: VariantChoiceProps): JSX.Element {
	const { variant, showing, onChoose } = props;
	const choose = useCallback((): void => {
		// The current variant is asked for as the absence of a variant, which is
		// what an address with no variant in it already means. Naming it by id
		// instead would pin a pane to a variant that stops being current the
		// moment somebody adopts a proposal.
		onChoose(variant.lifecycle === "current" ? null : variant.id);
	}, [onChoose, variant.id, variant.lifecycle]);
	return (
		<SidebarChoice
			pressed={showing}
			aria-label={spoken(variant)}
			title={spoken(variant)}
			data-slot="semantic-variant-choice"
			data-semantic-variant={variant.id}
			data-semantic-lifecycle={variant.lifecycle}
			onClick={choose}
		>
			<SidebarGlyph>
				<VariantMark lifecycle={variant.lifecycle} />
			</SidebarGlyph>
			<VariantName variant={variant} showing={showing} />
		</SidebarChoice>
	);
}

/**
 * The one variant a board has, said rather than offered: the row a choice
 * would be, without being a control.
 * @param props The variant on screen.
 * @param props.variant That variant.
 * @returns The row.
 */
function VariantStanding(props: { readonly variant: OfferedVariant }): JSX.Element {
	const { variant } = props;
	return (
		<SidebarRow
			control
			data-slot="semantic-variant-showing"
			data-semantic-variant={variant.id}
			data-semantic-lifecycle={variant.lifecycle}
		>
			<SidebarGlyph>
				<VariantMark lifecycle={variant.lifecycle} />
			</SidebarGlyph>
			<SidebarLabel>
				<span title={spoken(variant)}>{variant.name}</span>
				<span className="sr-only">, {variant.lifecycle}</span>
			</SidebarLabel>
		</SidebarRow>
	);
}

/**
 * The variants of this board, and which one is on screen.
 * @param props The variants, the one showing, and what a choice does.
 * @returns The list, the one variant said plainly, or null when there is none.
 */
function SemanticVariantBar(props: SemanticVariantBarProps): JSX.Element | null {
	const { variants, showing, opens, onChoose } = props;
	if (variants.length < 2) {
		const only = variants[0];
		return only === undefined ? null : <VariantStanding variant={only} />;
	}
	return (
		<SidebarChoices slot="semantic-variant-bar" label="Variants of this board">
			{variantOrder(variants, opens).map((variant) => (
				<VariantChoice
					key={variant.id}
					variant={variant}
					showing={showing === variant.id}
					onChoose={onChoose}
				/>
			))}
		</SidebarChoices>
	);
}

export { SemanticVariantBar, type SemanticVariantBarProps };
