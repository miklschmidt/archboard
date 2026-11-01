// The record of how the model has changed: one timeline with branches. The adopted line runs from
// the current state back through its history, each at its adoption with its date and its reason.
// Drafts branch off the state they came from, and a shelved state ends its branch with its reason.
// Choosing a state reads it in the pane. The state on screen holds its own prose inside its entry.
// The title of the page says where that state stands in the same words (`ModelStateFact`).

import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import { cn } from "@archboard/ui-kit/components";
import { TimelineLane, type LaneGeometry } from "#ui/components/variant-lifecycle/TimelineLane.tsx";
import { VariantMark } from "#ui/components/variant-lifecycle/VariantMark.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import {
	standingWords,
	type StateTimeline,
	type TimelineEntry,
} from "#ui/rules/architecture-model/state-timeline.ts";
import { timelineLanes, type Lane } from "#ui/rules/variant-lifecycle/timeline.ts";

/** Inputs for the timeline. */
interface ModelStateTimelineProps {
	readonly timeline: StateTimeline;
	/** The identity of the state on screen, or null for a reading with no state. */
	readonly showing: string | null;
	readonly paneId: string;
	/** What the state on screen says of itself. */
	readonly children: ReactNode;
}

/** Where the timeline's columns are: the rail of a tree, at the page's room. */
const PAGE_LANE: LaneGeometry = { origin: 24, step: 28, middle: 26, clearance: 11 };

/** The text column starts this far right of the deepest mark on its row. */
const TEXT_AFTER_MARK = 22;

/**
 * The model's states as a timeline.
 * @param props The timeline, the state on screen and what it says of itself.
 * @returns The timeline.
 */
function ModelStateTimeline(props: ModelStateTimelineProps): JSX.Element {
	const { timeline, showing, paneId } = props;
	const { selectState, selectCheckpoint } = useModelLocation(paneId);
	const lanes = useMemo(
		() => timelineLanes(timeline.entries.map((entry) => entry.depth)),
		[timeline],
	);
	// The current state is asked for as the absence of a state, which is what an address with no
	// state already means: naming it would pin the pane to a state that stops being current the
	// moment somebody adopts a proposal.
	const choose = useCallback(
		(entry: TimelineEntry): void => {
			if (entry.state.lifecycle === "current") selectCheckpoint(null);
			else selectState(entry.state.id);
		},
		[selectCheckpoint, selectState],
	);
	return (
		<div className="flex flex-col">
			{!timeline.built && (
				<p className="text-control text-muted-foreground mb-3 font-normal">
					Nothing this model describes is built yet: every state is a proposal.
				</p>
			)}
			<ol data-slot="model-state-timeline" className="flex flex-col">
				{timeline.entries.map((entry, index) => (
					<StateRow
						key={entry.state.id}
						entry={entry}
						lane={lanes[index]!}
						drawn={entry.state.id === showing}
						onChoose={choose}
					>
						{entry.state.id === showing ? props.children : null}
					</StateRow>
				))}
			</ol>
		</div>
	);
}

/**
 * The state on screen, as the title of the page names it: its lifecycle's mark, its name and where
 * it stands, in the words of its row.
 * @param props The state on the timeline.
 * @param props.entry The state on the timeline.
 * @returns The fact.
 */
function ModelStateFact(props: { readonly entry: TimelineEntry }): JSX.Element {
	const { entry } = props;
	return (
		<span data-slot="model-about-state" className="flex min-w-0 items-center gap-1.5">
			<VariantMark lifecycle={entry.state.lifecycle} />
			<span className="text-foreground truncate font-medium">{entry.state.name}</span>
			<span className="text-muted-foreground shrink-0">{standingWords(entry)}</span>
		</span>
	);
}

/**
 * One state on the timeline: its lane and mark, its name, where it stands and why. Choosing it
 * opens it in this pane. The state on screen holds the rest of what it says under its row.
 * @param props The state, its lane, whether it is on screen and how to open it.
 * @param props.entry The state on the timeline.
 * @param props.lane Its lane.
 * @param props.drawn Whether it is on screen.
 * @param props.onChoose Open it.
 * @param props.children What the state on screen says of itself.
 * @returns The row.
 */
function StateRow(props: {
	readonly entry: TimelineEntry;
	readonly lane: Lane;
	readonly drawn: boolean;
	readonly onChoose: (entry: TimelineEntry) => void;
	readonly children: ReactNode;
}): JSX.Element {
	const { entry, lane, drawn, onChoose } = props;
	const { state } = entry;
	const markX = PAGE_LANE.origin + lane.depth * PAGE_LANE.step;
	const rowStyle = useMemo(() => ({ paddingLeft: markX + TEXT_AFTER_MARK }), [markX]);
	const markStyle = useMemo(() => ({ left: markX - 8, top: PAGE_LANE.middle - 8 }), [markX]);
	const choose = useCallback((): void => onChoose(entry), [onChoose, entry]);
	return (
		<li className={cn("relative", drawn && "bg-sidebar-accent shadow-raised rounded-control")}>
			<button
				type="button"
				aria-pressed={drawn}
				data-slot="state-entry"
				data-timeline-state={state.id}
				data-lifecycle={state.lifecycle}
				onClick={choose}
				className={cn(
					"rounded-control relative flex w-full min-w-0 py-3 pr-4 text-left",
					!drawn && "hover:bg-sidebar-accent/50",
				)}
				style={rowStyle}
			>
				<span
					aria-hidden="true"
					className="absolute flex size-4 items-center justify-center"
					style={markStyle}
				>
					<VariantMark lifecycle={state.lifecycle} />
				</span>
				<StateWords entry={entry} drawn={drawn} />
			</button>
			<TimelineLane lane={lane} geometry={PAGE_LANE} />
			{props.children !== null && (
				<div className="pr-4 pb-4" style={rowStyle}>
					{props.children}
				</div>
			)}
		</li>
	);
}

/**
 * What a row says of its state: what it does, then what it is called and where it stands, and why
 * it stands there. The state on screen says why under its row.
 * @param props The state, and whether it is on screen.
 * @param props.entry The state on the timeline.
 * @param props.drawn Whether it is on screen.
 * @returns The words.
 */
function StateWords(props: {
	readonly entry: TimelineEntry;
	readonly drawn: boolean;
}): JSX.Element {
	const { entry, drawn } = props;
	const { summary, name, reason } = entry.state;
	return (
		<span className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="flex min-w-0 items-baseline gap-3">
				<span className="text-title min-w-0 flex-1">{summary ?? name}</span>
				{drawn && (
					<span className="text-body text-primary-text shrink-0 font-medium">On screen</span>
				)}
			</span>
			<StateStanding entry={entry} />
			{!drawn && reason !== undefined && (
				<span className="text-control text-muted-foreground max-w-[72ch] font-normal">
					{reason}
				</span>
			)}
		</span>
	);
}

/**
 * The name of a state that leads with its summary, and where the state stands.
 * @param props The state.
 * @param props.entry The state on the timeline.
 * @returns The line.
 */
function StateStanding({ entry }: { readonly entry: TimelineEntry }): JSX.Element {
	const { summary, name, lifecycle } = entry.state;
	return (
		<span className="flex min-w-0 items-baseline gap-3">
			{summary !== undefined && <span className="text-body truncate">{name}</span>}
			<span
				className={cn(
					"text-body shrink-0",
					lifecycle === "current" ? "text-foreground font-medium" : "text-muted-foreground",
				)}
			>
				{standingWords(entry)}
			</span>
		</span>
	);
}

export { ModelStateFact, ModelStateTimeline };
