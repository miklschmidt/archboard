// The letters of the panes showing something, drawn only when there are two
// panes: with one, the row being read already says where it is.

import type { JSX } from "react";

/** Inputs for the chips. */
interface PaneChipsProps {
	readonly letters: readonly string[];
}

/**
 * The letters of the panes showing something.
 * @param props The letters.
 * @returns The chips, or nothing.
 */
function PaneChips(props: PaneChipsProps): JSX.Element | null {
	if (props.letters.length === 0) return null;
	return (
		<span className="flex shrink-0 items-center gap-0.5">
			{props.letters.map((letter) => (
				<span
					key={letter}
					data-pane-letter={letter}
					className="bg-foreground text-background rounded-chip inline-flex size-4 items-center justify-center font-mono text-[10px] font-medium"
				>
					<span className="sr-only">shown in pane </span>
					{letter}
				</span>
			))}
		</span>
	);
}

export { PaneChips };
