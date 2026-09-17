// The board one level down, and whether it is really there.
//
// A drill-down names a board and one of its variants. Neither is checked when
// the board it is written on is validated — the two boards are independent
// documents with independent histories — so the check happens here, when
// somebody is about to follow the link, and its answer is shown rather than
// worked around. A named variant that is not there is reported. It is never
// quietly swapped for whichever variant is current: that would put a person in
// front of a different architecture from the one the link was about, and
// nothing on screen would say so (ADR 0023).
//
// The target's lifecycle is disclosed before it is opened, because "the current
// architecture", "a draft proposal" and "a frozen historical state" are three
// different things to be looking at.

import { useQuery } from "@tanstack/react-query";
import { useCallback, type JSX } from "react";

import type { DrillDown, SemanticVariant } from "@/shared/semantic-board/index";
import { Button } from "@/ui/components/button";
import {
	drillDownAsked,
	resolveDrillDown,
	type DrillResolution,
} from "@/ui/semantic-board-canvas/lib/drill-target";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";

/** What each lifecycle is called where a person reads it. */
const LIFECYCLE_WORDS: Readonly<Record<SemanticVariant["lifecycle"], string>> = {
	current: "the current architecture",
	draft: "a draft proposal",
	historical: "a frozen historical state",
	shelved: "a proposal that was let go",
};

/** Inputs for the section. */
interface SemanticDrillDownProps {
	/** What the selected node's drill-down names. */
	target: DrillDown;
	/**
	 * Open the target.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpen: (board: string, variant: string) => void;
}

/** Inputs for the ready state. */
interface ReadyProps extends SemanticDrillDownProps {
	/** The variant that answered.  */
	variant: SemanticVariant;
}

/**
 * A target that is there: which variant it is, where it stands, and the way in.
 * @param props The target, the variant and how to open it.
 * @returns The disclosure and its control.
 */
function DrillDownReady(props: ReadyProps): JSX.Element {
	const { target, variant, onOpen } = props;
	const handleOpen = useCallback((): void => {
		onOpen(target.board, variant.id);
	}, [onOpen, target.board, variant.id]);
	return (
		<>
			<p className="text-body">
				<span className="font-medium">{variant.name}</span>
				<span className="text-muted-foreground"> — {LIFECYCLE_WORDS[variant.lifecycle]}</span>
			</p>
			<Button
				variant="outline"
				size="sm"
				className="border-primary text-primary hover:bg-primary/10 hover:text-primary self-start"
				data-slot="semantic-drill-down-open"
				data-variant-lifecycle={variant.lifecycle}
				onClick={handleOpen}
			>
				Open {target.board}
			</Button>
		</>
	);
}

/**
 * Why a target cannot be opened, in words that name the thing that is missing.
 * @param resolution What the target board answered.
 * @param target What the drill-down names.
 * @returns The sentence, or null when there is nothing wrong.
 */
function refusalWords(resolution: DrillResolution, target: DrillDown): string | null {
	if (resolution.kind === "no-variant") {
		return `${target.board} has no variant called "${resolution.asked}". Nothing was opened in its place.`;
	}
	if (resolution.kind === "no-current") {
		return `${target.board} has no current variant, and this link asks for whichever one is.`;
	}
	return resolution.kind === "unreadable"
		? `${target.board} could not be read. ${resolution.problem}`
		: null;
}

/** Inputs for the resolved half of the section. */
interface OutcomeProps extends SemanticDrillDownProps {
	/** The target board, as its route answered, or undefined while it has not. */
	document: unknown;
	/** Why the read itself failed, when it did.  */
	failure: Error | null;
}

/**
 * What became of the link: the way in, or the reason there is none.
 * @param props The target, the target board and how to open it.
 * @returns The outcome.
 */
function DrillDownOutcome(props: OutcomeProps): JSX.Element {
	const { target, document, failure } = props;
	if (failure !== null) {
		return (
			<p className="text-body">
				{target.board} could not be opened. {failure.message}
			</p>
		);
	}
	if (document === undefined) {
		return <p className="text-muted-foreground text-body">Reading {target.board}…</p>;
	}
	const resolution = resolveDrillDown(target, document);
	if (resolution.kind === "ready") {
		return <DrillDownReady target={target} variant={resolution.variant} onOpen={props.onOpen} />;
	}
	return <p className="text-body">{refusalWords(resolution, target)}</p>;
}

/**
 * The level below the selected node.
 * @param props The target and how to open it.
 * @returns The section.
 */
function SemanticDrillDown(props: SemanticDrillDownProps): JSX.Element {
	const { target } = props;
	const document = useQuery(semanticBoardDocumentQuery(target.board));
	// The target board is read on the same terms as any other — no timer, fresh
	// when it announces a new version — and that contract only holds while
	// somebody is listening for the announcement. Without this the preview is
	// pinned for the life of the tab: a link asking for whichever variant is
	// current would go on naming the one that was current when it was first
	// read, and opening it would put a person in front of a state that has since
	// been superseded, with the panel still calling it current.
	useSemanticBoardChanges(target.board);
	return (
		<section className="flex flex-col gap-3" data-slot="semantic-drill-down">
			<h3 className="text-kicker text-muted-foreground uppercase">One level down</h3>
			<p className="text-technical truncate font-mono" title={target.board}>
				{target.board}
			</p>
			<p className="text-muted-foreground text-body">Asks for {drillDownAsked(target)}.</p>
			<DrillDownOutcome
				target={target}
				document={document.data}
				failure={document.error}
				onOpen={props.onOpen}
			/>
		</section>
	);
}

export { SemanticDrillDown, type SemanticDrillDownProps };
