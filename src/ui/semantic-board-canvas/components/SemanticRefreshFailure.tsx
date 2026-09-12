// What a pane says when the picture on it is the last one that loaded.
//
// A live architecture viewer's worst failure is a quiet one: somebody looks at
// a diagram and believes it is what the board says now. So a refresh that
// fails never takes the diagram away — showing nothing would be worse — and it
// never passes unmentioned either. The strip below is that disclosure: what is
// on screen, why it is not current, and the one thing to do about it.

import type { JSX } from "react";

import { Button } from "@/ui/components/button";
import { failureWords } from "@/ui/semantic-board-canvas/components/SemanticStageStates";

/** Inputs for the disclosure. */
interface SemanticRefreshFailureProps {
	/** Whatever the failed read threw. */
	error: unknown;
	/** Whether a read is on the wire right now. */
	retrying: boolean;
	/** Ask the server for the picture again. */
	onRetry: () => void;
}

/**
 * The strip above a diagram that could not be refreshed.
 * @param props What went wrong, whether a retry is running, and how to retry.
 * @returns The disclosure.
 */
function SemanticRefreshFailure(props: SemanticRefreshFailureProps): JSX.Element {
	const { detail } = failureWords(props.error);
	return (
		// An `output` rather than a labelled box: this is a live result the person
		// did not ask for, and its implicit `status` role is what puts it in front
		// of a screen reader without taking focus away from the diagram.
		<output
			data-slot="semantic-board-refresh-failure"
			className="border-border bg-muted/60 flex shrink-0 items-start gap-3 border-b px-4 py-2"
		>
			<span className="text-body min-w-0 flex-1">
				<span className="font-medium">This is the last picture that loaded.</span>{" "}
				<span className="text-muted-foreground">{detail}</span>
			</span>
			<Button
				variant="outline"
				size="xs"
				className="rounded-[2px] font-medium"
				onClick={props.onRetry}
				disabled={props.retrying}
			>
				{props.retrying ? "Trying again…" : "Try again"}
			</Button>
		</output>
	);
}

export { SemanticRefreshFailure, type SemanticRefreshFailureProps };
