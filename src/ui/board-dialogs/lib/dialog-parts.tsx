// Pieces every dialog in this module shares: the host's error as an alert,
// progress text, technical values in the mono face, and a facts table.

import { RiErrorWarningLine } from "@remixicon/react";
import { useMemo } from "react";

import type { DialogError } from "@/ui/board-dialogs/lib/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { buttonVariants } from "@/ui/components/button";
import { FieldError } from "@/ui/components/field";

/** The dismissing action of a dialog footer: a 28px ghost button. */
const CANCEL_BUTTON_CLASS = buttonVariants({ variant: "ghost", size: "sm" });

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
		<Alert variant="destructive" className="rounded-sm">
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
		<p aria-live="polite" className="text-muted-foreground text-body">
			{props.text}
		</p>
	);
}

/** Inputs for a technical value. */
interface TechnicalProps {
	children: React.ReactNode;
}

/**
 * An identifier, path, version or time in the mono face. A long value wraps
 * over three lines at most and carries its full text as a title.
 * @param props The value.
 * @returns The value as code.
 */
function Technical(props: TechnicalProps): React.JSX.Element {
	const { children } = props;
	return (
		<code
			title={typeof children === "string" ? children : undefined}
			className="text-technical line-clamp-3 font-mono break-all"
		>
			{children}
		</code>
	);
}

/**
 * The last segment of a path: the folder or file a person knows it by.
 * @param path An absolute path, with either separator.
 * @returns The final non-empty segment, or the path itself.
 */
function pathName(path: string): string {
	const segments = path.split(/[\\/]/u).filter((segment) => segment !== "");
	return segments.at(-1) ?? path;
}

/** Inputs for a path value. */
interface PathValueProps {
	path: string;
}

/**
 * A long path: its folder or file name first, then the whole path in the
 * mono face, clamped to three lines with the full text as a title.
 * @param props The path.
 * @returns The named path.
 */
function PathValue(props: PathValueProps): React.JSX.Element {
	const { path } = props;
	return (
		<span title={path} className="text-technical inline-flex min-w-0 flex-col font-mono">
			<span className="text-foreground font-medium">{pathName(path)}</span>
			<span className="text-muted-foreground line-clamp-3 break-all">{path}</span>
		</span>
	);
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
		<dl className="text-body grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
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
	CANCEL_BUTTON_CLASS,
	DialogErrorAlert,
	Fact,
	Facts,
	FieldIssues,
	PathValue,
	Technical,
	pathName,
	type FactRow,
};
