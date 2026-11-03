// The control that asks the picture how far a picked part reaches. Both panels offer this one
// control: a trace is attention, so it goes through `Peek` and nothing is written.

import { useCallback, type JSX } from "react";

import { usePeekControl, usePeeked } from "#ui/hooks/canvas/use-peek.ts";
import type { Way } from "#ui/rules/canvas/reading/reach.ts";

/** Inputs for the control that traces what a part reaches. */
interface TraceToggleProps {
	/** The part. */
	readonly part: string;
	/** What the part is called, which the control's name says. */
	readonly name: string;
	/** Which way along the relationships the trace goes. */
	readonly way: Way;
	/** How many parts the trace reaches. */
	readonly parts: number;
}

/**
 * What the control traces and how much that is, said in words.
 * @param props The part, the direction and how many parts it reaches.
 * @returns The control's accessible name.
 */
function traceName(props: TraceToggleProps): string {
	const { name, way, parts } = props;
	const what =
		way === "onward" ? `everything ${name} sends to` : `everything that sends to ${name}`;
	return `Trace ${what}, directly or through other parts: ${parts} ${parts === 1 ? "part" : "parts"}`;
}

/**
 * The control that asks the picture to trace what a part reaches, directly or
 * through other parts, in one direction. It says how many parts that is, and it
 * is pressed while the picture shows the trace.
 * @param props The part, the direction and how many parts it reaches.
 * @returns The control, or nothing when there is nothing to reach.
 */
function TraceToggle(props: TraceToggleProps): JSX.Element | null {
	const { part, way, parts } = props;
	const { trace } = usePeeked();
	const control = usePeekControl();
	const on = trace?.part === part && trace.way === way;
	const toggle = useCallback((): void => {
		control.trace(on ? null : { part, way });
	}, [control, on, part, way]);
	if (parts === 0) {
		return null;
	}
	return (
		<button
			type="button"
			aria-pressed={on}
			aria-label={traceName(props)}
			data-slot="semantic-inspector-trace"
			data-way={way}
			onClick={toggle}
			className="text-body border-border hover:bg-sidebar-accent/50 aria-pressed:border-primary-mark aria-pressed:bg-primary-subtle rounded-control flex h-6 shrink-0 items-center gap-1.5 border px-2 transition-colors"
		>
			{way === "onward" ? "Trace onward" : "Trace back"}
			<span aria-hidden="true" className="text-technical text-muted-foreground font-mono">
				{parts}
			</span>
		</button>
	);
}

export { TraceToggle };
