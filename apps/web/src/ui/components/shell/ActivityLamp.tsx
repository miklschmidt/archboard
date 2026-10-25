// An agent at work on a board (ADR 0022), in the status accent: lit and
// pulsing while it claims the board, a ring while it has just written without
// a claim, and a faint ring on a closed row an agent works inside of. In the
// tree the lamp sits on the corner of a row's marker; in Working now it has a
// column of its own.

import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/components";

/** What the lamp says. */
type LampState = "claimed" | "wrote" | "inside";

/** The lamp's look for each state. */
const LAMP_CLASSES: Readonly<Record<LampState, string>> = {
	claimed: "bg-status size-1.5 motion-safe:animate-pulse",
	wrote: "ring-status size-1.5 ring-[1.5px]",
	inside: "ring-status/70 size-[5px] ring-1",
};

/** Where a lamp sits on a tree row: the top right corner of its marker. */
const MARKER_CORNER = "absolute -top-px -right-0.5";

/** Inputs for the lamp. */
interface ActivityLampProps {
	readonly state: LampState;
	/** What the lamp says, on hover; the row's own name says it to assistive technology. */
	readonly title?: string;
	/** An identity hook for the lamp. */
	readonly slot?: string;
	/** Where the lamp sits. */
	readonly className?: string;
}

/**
 * Show at a glance that an agent works on a board, and how.
 * @param props The state, its words and its place.
 * @returns The lamp.
 */
function ActivityLamp(props: ActivityLampProps): JSX.Element {
	return (
		<span
			aria-hidden="true"
			data-slot={props.slot}
			title={props.title}
			className={cn("shrink-0 rounded-full", LAMP_CLASSES[props.state], props.className)}
		/>
	);
}

/**
 * Light a tree row's marker for an agent at work on the board it names.
 * @param props The state, its words and its identity hook.
 * @returns The lamp, on the marker's corner.
 */
function MarkerLamp(props: Omit<ActivityLampProps, "className">): JSX.Element {
	return <ActivityLamp {...props} className={MARKER_CORNER} />;
}

/**
 * Say on a closed folder or board that an agent works on a board inside it.
 * @returns The faint lamp, on the marker's corner.
 */
function InsideLamp(): JSX.Element {
	return (
		<MarkerLamp
			state="inside"
			title="An agent works on a board inside"
			slot="agent-activity-inside"
		/>
	);
}

export { ActivityLamp, InsideLamp, MarkerLamp, type LampState };
