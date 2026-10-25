// Why a move would be or was refused, in the move's own words.

import { RiErrorWarningLine } from "@remixicon/react";
import type { JSX } from "react";

import { Alert } from "@archboard/ui-kit/components";

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
			<Alert.Title>{props.title}</Alert.Title>
			<Alert.Description>{props.error.message}</Alert.Description>
		</Alert>
	);
}

export { MoveRefusal };
