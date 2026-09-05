// Pieces every dialog in this module shares: the host's error as an alert,
// progress text, technical values in the mono face, and a facts table.

import { RiErrorWarningLine } from "@remixicon/react";
import { useMemo } from "react";

import type { DialogError } from "@/ui/board-dialogs/lib/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { buttonVariants } from "@/ui/components/button";
import { FieldError } from "@/ui/components/field";

const OUTLINE_BUTTON_CLASS = buttonVariants({ variant: "outline" });

/** Inputs for the error alert. */
interface DialogErrorAlertProps {
	error: DialogError | null;
}

/**
 * The host's error, inside the dialog so the retry and the reason sit together.
 * @param props The error, or null.
 * @returns The alert, or nothing.
 */
function DialogErrorAlert(props: DialogErrorAlertProps): React.JSX.Element | null {
	const { error } = props;
	if (!error) {
		return null;
	}
	return (
		<Alert variant="destructive">
			<RiErrorWarningLine />
			<AlertTitle>{error.title}</AlertTitle>
			<AlertDescription>{error.message}</AlertDescription>
		</Alert>
	);
}

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
function BusyText(props: BusyTextProps): React.JSX.Element | null {
	if (!props.busy) {
		return null;
	}
	return (
		<p aria-live="polite" className="text-muted-foreground text-xs">
			{props.text}
		</p>
	);
}

/** Inputs for a technical value. */
interface TechnicalProps {
	children: React.ReactNode;
}

/**
 * An identifier, path, version or time in the mono face.
 * @param props The value.
 * @returns The value as code.
 */
function Technical(props: TechnicalProps): React.JSX.Element {
	return <code className="font-mono text-xs break-all">{props.children}</code>;
}

/** One row of a facts table. */
interface FactRow {
	label: string;
	value: string;
	/** True for identifiers, paths and times, which are set in the mono face. */
	technical: boolean;
}

/** Inputs for one fact. */
interface FactProps {
	row: FactRow;
}

/**
 * One label and value.
 * @param props The row.
 * @returns A definition pair.
 */
function Fact(props: FactProps): React.JSX.Element {
	const { row } = props;
	return (
		<div className="contents">
			<dt className="text-muted-foreground">{row.label}</dt>
			<dd className="min-w-0">{row.technical ? <Technical>{row.value}</Technical> : row.value}</dd>
		</div>
	);
}

/** Inputs for the facts table. */
interface FactsProps {
	rows: readonly FactRow[];
}

/**
 * A compact two-column facts table.
 * @param props The rows.
 * @returns The definition list.
 */
function Facts(props: FactsProps): React.JSX.Element {
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			{props.rows.map((row) => (
				<Fact key={row.label} row={row} />
			))}
		</dl>
	);
}

/** Inputs for a field's validation messages. */
interface FieldIssuesProps {
	messages: readonly string[];
}

/**
 * The validation messages under one field, through the official error slot.
 * @param props The messages.
 * @returns The field error, which renders nothing when there is none.
 */
function FieldIssues(props: FieldIssuesProps): React.JSX.Element {
	const { messages } = props;
	const errors = useMemo(() => messages.map((message) => ({ message })), [messages]);
	return <FieldError errors={errors} />;
}

export {
	BusyText,
	DialogErrorAlert,
	Fact,
	Facts,
	FieldIssues,
	OUTLINE_BUTTON_CLASS,
	Technical,
	type FactRow,
};
