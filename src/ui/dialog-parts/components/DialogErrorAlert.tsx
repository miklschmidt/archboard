// The host's error, inside the dialog so the retry and the reason sit together.

import { RiErrorWarningLine } from "@remixicon/react";
import type { JSX } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import type { DialogError } from "@/ui/dialog-parts/types/dialog-error";

/** Inputs for the error alert. */
interface DialogErrorAlertProps {
	error: DialogError | null;
}

/**
 * The host's error, inside the dialog so the retry and the reason sit together.
 * @param props The error, or null.
 * @returns The alert, or nothing.
 */
function DialogErrorAlert(props: DialogErrorAlertProps): JSX.Element | null {
	const { error } = props;
	if (!error) {
		return null;
	}
	return (
		<Alert variant="destructive" className="rounded-sm">
			<RiErrorWarningLine />
			<AlertTitle>{error.title}</AlertTitle>
			<AlertDescription>{error.message}</AlertDescription>
		</Alert>
	);
}

export { DialogErrorAlert, type DialogErrorAlertProps };
