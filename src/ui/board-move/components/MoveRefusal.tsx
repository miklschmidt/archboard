// Why a move would be or was refused, in the move's own words.

import { RiErrorWarningLine } from "@remixicon/react";
import type { JSX } from "react";

import { Alert, AlertDescription, AlertTitle } from "@archboard/ui-kit/display";

/** Inputs for the refusal. */
interface MoveRefusalProps {
	readonly title: string;
	readonly error: Error;
}

/**
 * A refusal, as an alert inside the dialog.
 * @param props What it is about, and the refusal.
 * @returns The alert.
 */
function MoveRefusal(props: MoveRefusalProps): JSX.Element {
	return (
		<Alert variant="destructive" className="rounded-sm">
			<RiErrorWarningLine />
			<AlertTitle>{props.title}</AlertTitle>
			<AlertDescription>{props.error.message}</AlertDescription>
		</Alert>
	);
}

export { MoveRefusal };
