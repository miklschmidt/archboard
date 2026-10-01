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
// Each row says the variant's name and where it stands, because those are
// different questions and a name alone answers neither: "Semantic boards" does
// not say whether it is the architecture or a suggestion about it. The
// lifecycle sits at the end of the row in the technical face, the way the
// navigator's variant rows carry it, so a variant looks the same wherever it
// is listed.
//
// A board with one variant offers no choice, for the reason the view bar
// offers none when a board has no views: a choice between one thing and
// nothing is furniture. It still says which variant is on screen, though,
// because that is a different question from "what else could I read" —
// somebody who followed a link into another board's "as built" has to be able
// to see that that is what they are looking at.

import { useCallback, type JSX } from "react";

import {
	SidebarChoice,
	SidebarChoices,
	SidebarLabel,
	SidebarMeta,
	SidebarRow,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";

/** Inputs for the variant bar. */
interface SemanticVariantBarProps {
	/** Every variant of this board, in the order the board states them. */
	variants: readonly OfferedVariant[];
	/** The one on screen, by id, or null while that is not yet known. */
	showing: string | null;
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
			data-slot="semantic-variant-choice"
			data-semantic-variant={variant.id}
			data-semantic-lifecycle={variant.lifecycle}
			onClick={choose}
		>
			<SidebarLabel>{variant.name}</SidebarLabel>
			<SidebarMeta technical>{variant.lifecycle}</SidebarMeta>
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
			<SidebarLabel>{variant.name}</SidebarLabel>
			<SidebarMeta technical>{variant.lifecycle}</SidebarMeta>
		</SidebarRow>
	);
}

/**
 * The variants of this board, and which one is on screen.
 * @param props The variants, the one showing, and what a choice does.
 * @returns The list, the one variant said plainly, or null when there is none.
 */
function SemanticVariantBar(props: SemanticVariantBarProps): JSX.Element | null {
	const { variants, showing, onChoose } = props;
	if (variants.length < 2) {
		const only = variants[0];
		return only === undefined ? null : <VariantStanding variant={only} />;
	}
	return (
		<SidebarChoices slot="semantic-variant-bar" label="Variants of this board">
			{variants.map((variant) => (
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
