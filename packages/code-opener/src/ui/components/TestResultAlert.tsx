// What the last opener test answered.

import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import type { JSX } from "react";

import type { CodeTargetOpenFailure } from "#shared/schemas/code-target-open.ts";
import { Alert, Technical } from "@archboard/ui-kit/components";
import type { OpenerTestResult } from "#ui/state/opener-settings-contracts.ts";

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
function TestResultAlert(props: TestResultAlertProps): JSX.Element | null {
	const { result } = props;
	if (!result) {
		return null;
	}
	if (result.success) {
		return (
			<Alert>
				<RiCheckLine />
				<Alert.Title>Opener works</Alert.Title>
				<Alert.Description>
					Opened <Technical>{result.repository}</Technical> with the chosen opener.
				</Alert.Description>
			</Alert>
		);
	}
	return (
		<Alert variant="destructive">
			<RiErrorWarningLine />
			<Alert.Title>
				Test failed · <Technical>{result.code}</Technical>
			</Alert.Title>
			<Alert.Description>
				<p>{result.error}</p>
				<FailureActions actions={result.actions} />
			</Alert.Description>
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
function FailureActions(props: FailureActionsProps): JSX.Element | null {
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
