// The three things a semantic pane says when it has no diagram to show.
//
// Each is a state of its own rather than a shared placeholder, because they
// are three different pieces of news: the server has not answered yet, the
// model is there and empty, and the model could not be drawn. A person acting
// on the wrong one of those wastes their afternoon.

import type { JSX, ReactNode } from "react";

import { DrawingMark } from "#ui/architecture-drawing/canvas/presentation/components/DrawingMark.tsx";
import type { SemanticOfferedView } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { ReadingError } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";

/** The classes every state of the stage fills its pane with. */
const STAGE_CLASS = "bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";

/** Inputs shared by the states that name their model. */
interface SemanticStateProps {
	/** The model the pane was asked for. */
	model: string;
}

/**
 * The little picture of a drawing, large and on the face of a wait notice, in the
 * middle of a pane waiting on its picture. It fades in only once a draw has taken
 * a while: most pictures arrive first, and a sign flashed in front of them would
 * be the only thing on screen that jumps.
 * @param props Where it goes.
 * @param props.className Classes for its placement.
 * @returns The sign of the wait.
 */
function StageSpinner(props: { readonly className?: string }): JSX.Element {
	return (
		<div
			aria-hidden="true"
			data-slot="canvas-spinner"
			className={`slow-wait-reveal flex items-center justify-center ${props.className ?? ""}`}
		>
			<div className="bg-popover border-border shadow-float rounded-panel border p-3">
				<DrawingMark large />
			</div>
		</div>
	);
}

/**
 * What the pane shows while the picture is being drawn.
 *
 * Nothing but the little picture of a drawing in the middle, and only once the draw has taken a
 * while; the pane says nothing about the shape of a model it has not seen.
 * @param props The model being drawn.
 * @returns The waiting pane.
 */
function SemanticStageLoading(props: SemanticStateProps): JSX.Element {
	return (
		<section
			aria-label={`Picture of ${props.model}`}
			data-slot="canvas-stage"
			data-state="loading"
			aria-busy="true"
			className={STAGE_CLASS}
		>
			<p aria-live="polite" className="sr-only">
				Drawing {props.model}…
			</p>
			<StageSpinner className="flex-1" />
		</section>
	);
}

/** An empty model, and whatever the last refresh has to disclose about it. */
interface SemanticEmptyProps extends SemanticStateProps {
	/** The shared view, when this is a narrowed reading. */
	view: SemanticOfferedView | null;
	/** The variant the empty result belongs to. */
	variant: string;
	/** The refresh-failure strip, or null while the answer is known to be current. */
	notice: ReactNode;
}

/**
 * What the pane shows for a model that is there and has nothing on it yet.
 *
 * It carries the same disclosure a drawn model does. An empty answer whose
 * refresh failed is the case that would otherwise look current: a model
 * somebody has since filled in still reads as empty, and nothing on screen
 * would say the answer is old.
 * @param props The model and the refresh disclosure.
 * @returns The empty state.
 */
function SemanticStageEmpty(props: SemanticEmptyProps): JSX.Element {
	return (
		<section
			aria-label={`Picture of ${props.model}`}
			data-slot="canvas-stage"
			data-state={props.notice === null ? "empty" : "stale"}
			className={`${STAGE_CLASS} items-center justify-center gap-2 p-8 text-center`}
		>
			{props.notice}
			<p className="text-title">
				{props.view === null
					? `${props.model} has nothing on it yet`
					: `${props.view.name} is empty on ${props.variant}`}
			</p>
			<p className="text-muted-foreground text-body max-w-prose">
				{props.view === null
					? "The model is here and readable. Ask an agent to put some architecture on it."
					: "This variant has no subjects in this view. Choose another view or variant to continue."}
			</p>
		</section>
	);
}

/** What each way of failing is called, in the shell's voice. */
const FAILURE_TITLES: Readonly<Record<string, string>> = {
	UNKNOWN_VARIANT: "There is no such variant",
	UNKNOWN_VIEW: "There is no such view",
	MODEL_UNREADABLE: "This model could not be read",
	UNREACHABLE: "The Archboard server did not answer",
	REPLY_INVALID: "The Archboard server sent something unexpected",
};

/**
 * What went wrong, in words a person can act on.
 * @param error Whatever the read threw.
 * @returns A title and the detail behind it.
 */
function failureWords(error: unknown): { title: string; detail: string } {
	if (error instanceof ReadingError) {
		return {
			title: FAILURE_TITLES[error.code] ?? "This model could not be drawn",
			detail: error.message,
		};
	}
	return {
		title: "This model could not be drawn",
		detail: error instanceof Error ? error.message : "The reason was not reported.",
	};
}

/** Inputs for the failure state. */
interface SemanticStageProblemProps extends SemanticStateProps {
	/** Whatever the read threw. */
	error: unknown;
}

/**
 * What the pane shows when the model could not be drawn: the refusals the
 * routes answer with, and a request that never arrived.
 * @param props The model and what went wrong.
 * @returns The failure state.
 */
function SemanticStageProblem(props: SemanticStageProblemProps): JSX.Element {
	const { title, detail } = failureWords(props.error);
	return (
		<section
			aria-label={`Picture of ${props.model}`}
			data-slot="canvas-stage"
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
	StageSpinner,
	failureWords,
};
