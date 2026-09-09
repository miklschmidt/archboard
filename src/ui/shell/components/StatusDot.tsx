// The small state dots the reference uses beside connection and claim text.

import { cn } from "cn";
import type { JSX } from "react";

/** Inputs for one state dot. */
interface StatusDotProps {
	/**
	 * `live` is the acid-lime accent; `idle` is a muted neutral; `warning` is
	 * the amber of a board that needs a decision, never the destructive red.
	 */
	tone: "live" | "idle" | "warning";
	className?: string | undefined;
}

const TONE_CLASS: Record<StatusDotProps["tone"], string> = {
	live: "bg-status",
	idle: "bg-muted-foreground/40",
	warning: "bg-warning",
};

/**
 * A decorative dot; the text beside it carries the meaning.
 * @param props Which tone to paint.
 * @returns A six-pixel circle.
 */
function StatusDot(props: StatusDotProps): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				TONE_CLASS[props.tone],
				props.className,
			)}
		/>
	);
}

export { StatusDot, type StatusDotProps };
