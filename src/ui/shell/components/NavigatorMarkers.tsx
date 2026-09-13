import type { JSX } from "react";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import type { NavigatorEntry } from "@/ui/shell/lib/navigator-entries";
import type { AgentActivityEntry } from "@/ui/types";

const VARIANT_LABELS = { current: "Current", draft: "Draft", historical: "Historical" } as const;

/** Inputs for the small markers beside a name. */
interface EntryMarkersProps {
	entry: NavigatorEntry;
}

/**
 * What the live marker says of an agent's work on a board (ADR 0022).
 * @param activity The agent's activity on the board.
 * @returns The accessible name: the claim and its reason, or a passing write.
 */
function activityLabel(activity: AgentActivityEntry): string {
	if (activity.claim === null) {
		return "Agent writing this board";
	}
	const reason = activity.claim.reason;
	return reason === undefined ? "Agent claimed this board" : `Agent claimed this board: ${reason}`;
}

/**
 * The live marker beside a board an agent is working on: the lime dot the
 * header and dock use, pulsing, named for assistive technology and the pointer.
 * @param props The entry.
 * @returns The marker, or nothing while no agent is on the board.
 */
function ActivityMarker(props: EntryMarkersProps): JSX.Element | null {
	const { activity } = props.entry;
	if (activity === null) {
		return null;
	}
	const label = activityLabel(activity);
	return (
		<span
			title={label}
			data-slot="agent-activity"
			className="inline-flex h-4 shrink-0 items-center px-0.5"
		>
			<StatusDot tone="live" className="motion-safe:animate-pulse" />
			<span className="sr-only">{label}</span>
		</span>
	);
}

/**
 * The latest thing an agent said it was doing to a board, as a second line
 * under the name while the activity lingers (ADR 0022).
 * @param props The entry.
 * @returns The line, or nothing while nothing was said.
 */
function DoingLine(props: EntryMarkersProps): JSX.Element | null {
	const doing = props.entry.activity?.doing ?? null;
	if (doing === null) {
		return null;
	}
	return (
		<span
			data-slot="agent-doing"
			className="text-muted-foreground text-technical line-clamp-1 min-w-0 whitespace-normal!"
		>
			{doing.doing}
		</span>
	);
}

/**
 * Lifecycle and on-screen markers, right-aligned on the name line.
 * @param props The entry.
 * @returns The markers.
 */
function EntryMarkers(props: EntryMarkersProps): JSX.Element {
	const { draft, variant, onScreen } = props.entry;
	return (
		<span className="text-technical flex h-4 shrink-0 items-center gap-1.5 font-normal">
			<ActivityMarker entry={props.entry} />
			{(draft || variant !== undefined) && (
				<span className="text-muted-foreground">
					{variant === undefined ? "Draft" : VARIANT_LABELS[variant.lifecycle]}
				</span>
			)}
			{onScreen.map((pane) => (
				<span
					key={pane}
					className="bg-foreground text-background inline-flex h-4 min-w-4 items-center justify-center rounded-[2px] px-1 font-mono font-medium"
				>
					<span className="sr-only">on screen in pane </span>
					{pane}
				</span>
			))}
		</span>
	);
}

export { EntryMarkers, DoingLine };
