// One state line: a dot, the words, and the recovery words when there are any.

import { cn } from "cn";

import type { StateLine } from "@/ui/workbench/session-projection";

/** Inputs for one state line. */
interface StateLineRowProps {
	line: StateLine;
	/** Rendered after the words: the actions that change this state. */
	children?: React.ReactNode;
}

const DOT_CLASS: Record<StateLine["tone"], string> = {
	live: "bg-status",
	idle: "bg-muted-foreground/40",
	warning: "bg-destructive",
};

/**
 * A state line with its tone dot and optional actions.
 * @param props The line and its actions.
 * @returns One dense row.
 */
function StateLineRow(props: StateLineRowProps): React.JSX.Element {
	const { line } = props;
	return (
		<div className="flex min-w-0 items-center gap-2 text-xs">
			<span
				aria-hidden="true"
				className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT_CLASS[line.tone])}
			/>
			<span className={cn("truncate", line.tone === "warning" && "text-destructive")}>
				{line.text}
			</span>
			{line.recovery === null ? null : (
				<span className="text-muted-foreground truncate">{line.recovery}</span>
			)}
			{props.children === undefined ? null : (
				<span className="ms-auto flex shrink-0 items-center gap-1">{props.children}</span>
			)}
		</div>
	);
}

export { StateLineRow, type StateLineRowProps };
