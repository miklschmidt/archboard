// Progress text announced while a dialog's request is in flight.

import type { JSX } from "react";

/** Inputs for the progress text. */
interface BusyTextProps {
	busy: boolean;
	text: string;
}

/**
 * Progress text announced while a request is in flight.
 * @param props Whether the dialog is busy and what to say.
 * @returns The live text, or nothing while idle.
 */
function BusyText(props: BusyTextProps): JSX.Element | null {
	if (!props.busy) {
		return null;
	}
	return (
		<p aria-live="polite" className="text-muted-foreground text-body">
			{props.text}
		</p>
	);
}

export { BusyText, type BusyTextProps };
