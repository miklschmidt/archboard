// What the last opener test answered.

import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";

import type { CodeTargetOpenFailure } from "@/shared/code-target";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Technical } from "@/ui/dialog-parts";
import type { OpenerTestResult } from "@/ui/opener-settings/types/contracts";

/** Inputs for the test result. */
interface TestResultAlertProps {
	result: OpenerTestResult | null;
}

/**
 * What the last test answered. It stays until the host clears it, because a
 * failure names the fix.
 * @param props The result, or null.
 * @returns An alert, or nothing.
 */
function TestResultAlert(props: TestResultAlertProps): React.JSX.Element | null {
	const { result } = props;
	if (!result) {
		return null;
	}
	if (result.success) {
		return (
			<Alert>
				<RiCheckLine />
				<AlertTitle>Opener works</AlertTitle>
				<AlertDescription>
					Opened <Technical>{result.repository}</Technical> with the chosen opener.
				</AlertDescription>
			</Alert>
		);
	}
	return (
		<Alert variant="destructive">
			<RiErrorWarningLine />
			<AlertTitle>
				Test failed · <Technical>{result.code}</Technical>
			</AlertTitle>
			<AlertDescription>
				<p>{result.error}</p>
				<FailureActions actions={result.actions} />
			</AlertDescription>
		</Alert>
	);
}

/** Inputs for the failure's actions. */
interface FailureActionsProps {
	actions: CodeTargetOpenFailure["actions"];
}

/**
 * The links a failure offers. The settings action is this dialog, so only
 * GitHub links are rendered.
 * @param props The failure's actions.
 * @returns The links, or nothing.
 */
function FailureActions(props: FailureActionsProps): React.JSX.Element | null {
	const links = (props.actions ?? []).filter((action) => action.kind === "github");
	if (links.length === 0) {
		return null;
	}
	return (
		<p>
			{links.map((action) => (
				<a key={action.href} href={action.href} target="_blank" rel="noreferrer">
					{action.label}
				</a>
			))}
		</p>
	);
}

export { TestResultAlert, type TestResultAlertProps };
