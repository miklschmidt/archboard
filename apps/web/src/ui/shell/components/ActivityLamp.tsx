// An agent at work on a model (ADR 0022), in the status accent: lit and
// pulsing while it claims the model, a ring while it has just written without
// a claim. In the tree the lamp sits on the corner of a row's marker; in
// Working now it has a column of its own. A claim is status only: its mark
// says what the agent is doing on hover and to assistive technology, and it
// takes no click and no focus.

import type { JSX } from "react";

import { Badge, cn } from "@archboard/ui-kit/components";
import { claimWords } from "#ui/shell/rules/claims.ts";

/** What the lamp says. */
type LampState = "claimed" | "wrote";

/** The lamp's look for each state. The pulse stops under reduced motion. */
const LAMP_CLASSES: Readonly<Record<LampState, string>> = {
	claimed: "bg-status size-1.5 motion-safe:animate-pulse",
	wrote: "ring-status size-1.5 ring-[1.5px]",
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
 * Show at a glance that an agent works on a model, and how.
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
 * Light a tree row's marker for an agent at work on the model it names.
 * @param props The state, its words and its identity hook.
 * @returns The lamp, on the marker's corner.
 */
function MarkerLamp(props: Omit<ActivityLampProps, "className">): JSX.Element {
	return <ActivityLamp {...props} className={MARKER_CORNER} />;
}

/** Inputs for a claim's mark. */
interface ClaimMarkProps {
	/** The purposes of the claims that hold what the mark stands on, each once. */
	readonly purposes: readonly string[];
	/** Where the mark sits. */
	readonly className?: string;
}

/**
 * Mark something an agent claims: the pulsing lamp, which says the agent's purpose on hover and to
 * assistive technology.
 * @param props The purposes and the place.
 * @returns The mark.
 */
function ClaimMark(props: ClaimMarkProps): JSX.Element {
	const words = claimWords(props.purposes);
	return (
		<span
			data-slot="claim-mark"
			title={words}
			className={cn(
				"ring-status-foreground flex size-1.5 shrink-0 rounded-full ring-1 dark:ring-0",
				props.className,
			)}
		>
			<ActivityLamp state="claimed" />
			<span className="sr-only">{words}</span>
		</span>
	);
}

/**
 * Mark a tree row's marker for a model that an agent claims.
 * @param props The purposes.
 * @returns The mark, on the marker's corner.
 */
function MarkerClaim(props: Omit<ClaimMarkProps, "className">): JSX.Element {
	return <ClaimMark {...props} className={MARKER_CORNER} />;
}

/**
 * Say in a head that an agent claims its subject: the pulsing lamp and `Claimed`, with the agent's
 * purpose on hover and to assistive technology. The chip keeps to the 16px line of the words beside
 * it, so a claim that starts or ends moves nothing under it.
 * @param props The purposes.
 * @returns The badge.
 */
function ClaimBadge(props: Omit<ClaimMarkProps, "className">): JSX.Element {
	const words = claimWords(props.purposes);
	return (
		<Badge
			variant="outline"
			size="label"
			data-slot="claim-badge"
			title={words}
			className="-my-px h-4.5"
		>
			<ActivityLamp state="claimed" />
			<span aria-hidden="true">Claimed</span>
			<span className="sr-only">{words}</span>
		</Badge>
	);
}

export { ActivityLamp, ClaimBadge, ClaimMark, MarkerClaim, MarkerLamp };
