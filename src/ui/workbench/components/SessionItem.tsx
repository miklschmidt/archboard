// One session item of the definition list: a tone dot beside the state words
// as the term, the recovery words as the detail, and the actions that change
// this state as a second detail.

import { cn } from "cn";
import type { JSX, ReactNode } from "react";

import type { StateLine } from "@/ui/workbench/session-projection";

/** Inputs for one session item. */
interface SessionItemProps {
	line: StateLine;
	/** Rendered after the words: the actions that change this state. */
	children?: ReactNode;
}

/**
 * The dot per tone. A warning is a real failure with recovery words beside
 * it; the dot carries the tone so the words stay in the foreground colour.
 */
const DOT_CLASS: Record<StateLine["tone"], string> = {
	live: "bg-status",
	idle: "bg-muted-foreground/60",
	warning: "bg-destructive",
};

/**
 * A session item with its tone dot, recovery words and optional actions.
 * @param props The line and its actions.
 * @returns A term and its details.
 */
function SessionItem(props: SessionItemProps): JSX.Element {
	const { line } = props;
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-body flex min-w-0 items-start gap-2 font-medium">
				<span
					aria-hidden="true"
					className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", DOT_CLASS[line.tone])}
				/>
				<span className="line-clamp-2 break-words">{line.text}</span>
			</dt>
			{line.recovery === null ? null : (
				<dd className="text-body text-muted-foreground ps-3.5">{line.recovery}</dd>
			)}
			{props.children === undefined ? null : (
				<dd className="flex flex-wrap items-center gap-1 ps-3.5 pt-0.5">{props.children}</dd>
			)}
		</div>
	);
}

export { SessionItem, type SessionItemProps };
