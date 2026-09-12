// Where a pane is, once somebody has followed a drill-down out of the board it
// was opened on.
//
// A pane that silently became a different board would be the worst kind of
// navigation: the address bar still names the board the pane was opened on,
// because following a link down a level is presentation state and not an edit
// to what the shell decided this pane shows. So the strip below says out loud
// which board is on screen, which one it was reached from, and offers the way
// back. It is only ever drawn once something has actually been followed.

import { RiArrowLeftSLine } from "@remixicon/react";
import { type JSX } from "react";

import { Button } from "@/ui/components/button";
import type { DrillStop } from "@/ui/semantic-board-canvas/hooks/use-drill-down";

/** Inputs for the trail. */
interface SemanticTrailProps {
	/** How the pane got here, starting at the board it was opened on. */
	trail: readonly DrillStop[];
	/** The board on screen. */
	board: string;
	/** Go back one level. */
	onBack: () => void;
}

/**
 * The strip above a diagram somebody drilled into.
 * @param props The trail, the board on screen and the way back.
 * @returns The strip, or null while the pane is showing its own board.
 */
function SemanticTrail(props: SemanticTrailProps): JSX.Element | null {
	const { trail } = props;
	const from = trail[trail.length - 1];
	if (from === undefined) {
		return null;
	}
	return (
		<div
			data-slot="semantic-board-trail"
			data-board={props.board}
			className="border-border bg-muted/60 flex shrink-0 items-center gap-2 border-b px-2 py-1"
		>
			<Button
				variant="ghost"
				size="xs"
				className="text-muted-foreground rounded-[2px]"
				onClick={props.onBack}
			>
				<RiArrowLeftSLine data-icon="inline-start" />
				{from.board}
			</Button>
			<span className="text-body min-w-0 flex-1 truncate">
				{trail.map((stop) => stop.board).join(" › ")} › <span>{props.board}</span>
			</span>
		</div>
	);
}

export { SemanticTrail, type SemanticTrailProps };
