// The code view's column in Code mode (TASK-649). The reading of the focused pane fills it with
// the open file, as it fills the navigator with the files, so the shell knows nothing about code.
// A pane with nothing to read leaves it empty, and the column says so.

import type { JSX } from "react";

/** Inputs for the column. */
interface CodeViewSlotProps {
	/** Where the focused pane puts its code view. */
	readonly attach: (element: HTMLDivElement | null) => void;
}

/**
 * The code view's place, and what it says while no pane fills it.
 * @param props Where the pane puts its view.
 * @returns The column's content.
 */
function CodeViewSlot(props: CodeViewSlotProps): JSX.Element {
	const { attach } = props;
	return (
		<div data-slot="code-view-column" className="bg-sidebar flex h-full w-full min-w-0 flex-col">
			<div
				ref={attach}
				data-slot="code-view"
				className="peer flex min-h-0 flex-1 flex-col empty:hidden"
			/>
			<p className="text-body text-muted-foreground hidden p-4 peer-empty:block">
				Open a model to read its code.
			</p>
		</div>
	);
}

export { CodeViewSlot };
