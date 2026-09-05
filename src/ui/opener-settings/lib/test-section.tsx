// The repository a test opens, and what the test answered.

import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useId } from "react";

import type { CodeTargetOpenFailure, OpenerSettingsReply } from "@/shared/code-target";
import { Technical } from "@/ui/board-dialogs";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Badge } from "@/ui/components/badge";
import { Field, FieldDescription, FieldLabel } from "@/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/components/select";
import type { OpenerTestResult } from "@/ui/opener-settings/lib/contracts";

type CheckoutChoice = OpenerSettingsReply["repositories"][number];

/** Inputs for one repository entry. */
interface RepositoryItemProps {
	checkout: CheckoutChoice;
}

/**
 * One checkout, with a badge when it cannot be opened as registered.
 * @param props The checkout.
 * @returns A select item.
 */
function RepositoryItem(props: RepositoryItemProps): React.JSX.Element {
	const { checkout } = props;
	return (
		<SelectItem value={checkout.repository}>
			<span className="font-mono">{checkout.repository}</span>
			{!checkout.exists && <Badge variant="destructive">missing</Badge>}
			{checkout.exists && !checkout.identityMatches && (
				<Badge variant="secondary">identity changed</Badge>
			)}
		</SelectItem>
	);
}

/** Inputs for the repository field. */
interface RepositoryFieldProps {
	repositories: readonly CheckoutChoice[];
	value: string | null;
	disabled: boolean;
	onChange: (repository: string | null) => void;
}

/**
 * The registered checkout a test opens.
 * @param props The checkouts, the chosen one and the change handler.
 * @returns The field.
 */
function RepositoryField(props: RepositoryFieldProps): React.JSX.Element {
	const id = useId();
	const { onChange } = props;
	const handleChange = useCallback((value: string | null) => onChange(value), [onChange]);
	const chosen = props.repositories.find((checkout) => checkout.repository === props.value);
	return (
		<Field>
			<FieldLabel htmlFor={id}>Test with repository</FieldLabel>
			<Select value={props.value} onValueChange={handleChange} disabled={props.disabled}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue placeholder="No registered checkout" />
				</SelectTrigger>
				<SelectContent>
					{props.repositories.map((checkout) => (
						<RepositoryItem key={checkout.repository} checkout={checkout} />
					))}
				</SelectContent>
			</Select>
			<FieldDescription>
				{chosen ? (
					<Technical>{chosen.root}</Technical>
				) : (
					"A test opens a checkout's root with the chosen opener."
				)}
			</FieldDescription>
		</Field>
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

export { RepositoryField, TestResultAlert };
