// The three things a semantic pane says when it has no diagram to show.
//
// Each is a state of its own rather than a shared placeholder, because they
// are three different pieces of news: the server has not answered yet, the
// board is there and empty, and the board could not be drawn. A person acting
// on the wrong one of those wastes their afternoon.

import type { JSX, ReactNode } from "react";

import { Skeleton } from "@/ui/components/skeleton";
import type { SemanticOfferedView } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticBoardError } from "@/ui/semantic-board-canvas/api/semantic-boards";

/** The classes every state of the stage fills its pane with. */
const STAGE_CLASS = "bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";

/** Inputs shared by the states that name their board. */
interface SemanticStateProps {
	/** The board the pane was asked for. */
	board: string;
}

/**
 * What the pane shows while the server is drawing.
 *
 * The shape of a diagram rather than a spinner, following the navigator's
 * register: a band of regions with cards on them, so the pane already has the
 * weight and rhythm of what is about to arrive.
 * @param props The board being drawn.
 * @returns The skeleton.
 */
function SemanticStageLoading(props: SemanticStateProps): JSX.Element {
	return (
		<section
			aria-label={`Semantic board ${props.board}`}
			data-slot="semantic-board-stage"
			data-state="loading"
			aria-busy="true"
			className={STAGE_CLASS}
		>
			<p aria-live="polite" className="sr-only">
				Drawing {props.board}…
			</p>
			<div className="flex flex-col gap-6 p-8">
				{[0, 1].map((band) => (
					<div key={band} className="flex flex-col gap-2">
						<Skeleton className="h-3 w-32 rounded-[2px] motion-reduce:animate-none" />
						<div className="flex gap-3">
							{[0, 1, 2].map((card) => (
								<Skeleton
									key={card}
									className="h-20 w-48 rounded-[2px] motion-reduce:animate-none"
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

/** An empty board, and whatever the last refresh has to disclose about it. */
interface SemanticEmptyProps extends SemanticStateProps {
	/** The shared view, when this is a narrowed reading. */
	view: SemanticOfferedView | null;
	/** The variant the empty result belongs to. */
	variant: string;
	/** The refresh-failure strip, or null while the answer is known to be current. */
	notice: ReactNode;
}

/**
 * What the pane shows for a board that is there and has nothing on it yet.
 *
 * It carries the same disclosure a drawn board does. An empty answer whose
 * refresh failed is the case that would otherwise look current: a board
 * somebody has since filled in still reads as empty, and nothing on screen
 * would say the answer is old.
 * @param props The board and the refresh disclosure.
 * @returns The empty state.
 */
function SemanticStageEmpty(props: SemanticEmptyProps): JSX.Element {
	return (
		<section
			aria-label={`Semantic board ${props.board}`}
			data-slot="semantic-board-stage"
			data-state={props.notice === null ? "empty" : "stale"}
			className={`${STAGE_CLASS} items-center justify-center gap-2 p-8 text-center`}
		>
			{props.notice}
			<p className="text-title">
				{props.view === null
					? `${props.board} has nothing on it yet`
					: `${props.view.name} is empty on ${props.variant}`}
			</p>
			<p className="text-muted-foreground text-body max-w-prose">
				{props.view === null
					? "The board is here and readable. Ask an agent to put some architecture on it."
					: "This variant has no subjects in this view. Choose another view or variant to continue."}
			</p>
		</section>
	);
}

/** What each way of failing is called, in the shell's voice. */
const FAILURE_TITLES: Readonly<Record<string, string>> = {
	BOARD_MISSING: "There is no such board",
	UNKNOWN_VARIANT: "There is no such variant",
	UNKNOWN_VIEW: "There is no such view",
	BOARD_UNREADABLE: "This board could not be read",
	UNREACHABLE: "The canvas server did not answer",
	REPLY_INVALID: "The canvas server sent something unexpected",
};

/**
 * What went wrong, in words a person can act on.
 * @param error Whatever the read threw.
 * @returns A title and the detail behind it.
 */
function failureWords(error: unknown): { title: string; detail: string } {
	if (error instanceof SemanticBoardError) {
		return {
			title: FAILURE_TITLES[error.code] ?? "This board could not be drawn",
			detail: error.message,
		};
	}
	return {
		title: "This board could not be drawn",
		detail: error instanceof Error ? error.message : "The reason was not reported.",
	};
}

/** Inputs for the failure state. */
interface SemanticStageProblemProps extends SemanticStateProps {
	/** Whatever the read threw. */
	error: unknown;
}

/**
 * What the pane shows when the board could not be drawn: the refusals the
 * routes answer with, and a request that never arrived.
 * @param props The board and what went wrong.
 * @returns The failure state.
 */
function SemanticStageProblem(props: SemanticStageProblemProps): JSX.Element {
	const { title, detail } = failureWords(props.error);
	return (
		<section
			aria-label={`Semantic board ${props.board}`}
			data-slot="semantic-board-stage"
			data-state="error"
			className={`${STAGE_CLASS} items-center justify-center gap-2 p-8 text-center`}
		>
			<p className="text-title" role="alert">
				{title}
			</p>
			<p className="text-muted-foreground text-body max-w-prose">{detail}</p>
		</section>
	);
}

export {
	STAGE_CLASS,
	SemanticStageEmpty,
	SemanticStageLoading,
	SemanticStageProblem,
	failureWords,
	type SemanticEmptyProps,
	type SemanticStageProblemProps,
	type SemanticStateProps,
};
