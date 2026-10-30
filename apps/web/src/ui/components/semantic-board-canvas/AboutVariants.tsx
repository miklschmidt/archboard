// The About page's record of how the board has changed: one timeline with
// branches, the navigator's rail at the page's room. The adopted line runs from
// the current variant back through its history, each at its adoption with its
// date and its reason. Drafts branch off the variant they came from, and a
// shelved variant ends its branch with its reason. Choosing a variant reads it
// in the pane. While the pane reads the variant the board's name opens, a draft
// or a shelved variant also opens in the pane beside it (TASK-538.04). The title
// of the page says where the variant on screen stands in the same words
// (`VariantStanding`).

import { RiLayoutColumnLine } from "@remixicon/react";
import { useCallback, useMemo, type JSX } from "react";

import { cn, IconButton } from "@archboard/ui-kit/components";
import type {
	TimelineEntry,
	VariantTimeline,
} from "#ui/rules/semantic-board-canvas/board/variant-timeline.ts";
import { TimelineLane, type LaneGeometry } from "#ui/components/variant-lifecycle/TimelineLane.tsx";
import { timelineLanes, type Lane } from "#ui/rules/variant-lifecycle/timeline.ts";
import { VariantMark } from "#ui/components/variant-lifecycle/VariantMark.tsx";

/** Inputs for the timeline. */
interface AboutVariantsProps {
	/** The board's variants, in the order of the timeline. */
	readonly timeline: VariantTimeline;
	/** The id of the variant on screen, or null when the board has no such variant. */
	readonly showing: string | null;
	/** The id of the variant the board's name opens, or null when it opens none. */
	readonly opens: string | null;
	/**
	 * The person chose a variant to read.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	readonly onChoose: ((variant: string | null) => void) | undefined;
	/**
	 * The person asked for a variant in the pane beside; undefined when the pane cannot.
	 * @param variant The variant's id.
	 */
	readonly onBeside?: ((variant: string) => void) | undefined;
}

/** Where the timeline's columns are: the navigator's rail, at the page's room. */
const PAGE_LANE: LaneGeometry = { origin: 24, step: 28, middle: 26, clearance: 11 };

/** The text column starts this far right of the deepest mark on its row. */
const TEXT_AFTER_MARK = 22;

/**
 * The board's variants as a timeline.
 * @param props The timeline, the variant on screen and how to read another.
 * @returns The timeline.
 */
function AboutVariants(props: AboutVariantsProps): JSX.Element {
	const { timeline } = props;
	const lanes = useMemo(
		() => timelineLanes(timeline.entries.map((entry) => entry.depth)),
		[timeline],
	);
	// A proposal opens beside the variant the board's name opens, so the offer
	// stands while that variant is on screen.
	const beside =
		props.showing !== null && props.showing === props.opens ? props.onBeside : undefined;
	return (
		<div className="flex flex-col">
			{!timeline.built && (
				<p className="text-control text-muted-foreground mb-3 font-normal">
					Nothing this board describes is built yet: every variant is a proposal.
				</p>
			)}
			<ol className="flex flex-col">
				{timeline.entries.map((entry, index) => (
					<TimelineRow
						key={entry.variant.id}
						entry={entry}
						lane={lanes[index]!}
						drawn={entry.variant.id === props.showing}
						onChoose={props.onChoose}
						onBeside={beside}
					/>
				))}
			</ol>
		</div>
	);
}

/**
 * Where a variant stands, in the words its row says under its name: its
 * lifecycle, when the record says it got there, and what it came from.
 * @param entry The variant on the timeline.
 * @returns The words.
 */
function standingWords(entry: TimelineEntry): string {
	const { variant, adopted, shelved } = entry;
	const word = `${variant.lifecycle.charAt(0).toUpperCase()}${variant.lifecycle.slice(1)}`;
	if (shelved !== undefined) return `${word} ${shelved.at.slice(0, 10)}`;
	if (adopted !== undefined) return `${word} · adopted ${adopted.at.slice(0, 10)}`;
	if (variant.lifecycle === "draft" && entry.from !== undefined) {
		return `${word} · from ${entry.from}`;
	}
	return word;
}

/**
 * Why the variant stands where it does, in the record's words: why it was
 * adopted or let go; for a proposal, what it says about itself.
 * @param entry The variant on the timeline.
 * @returns The words, or undefined.
 */
function reasonOf(entry: TimelineEntry): string | undefined {
	return entry.shelved?.reason ?? entry.adopted?.reason ?? entry.variant.summary;
}

/**
 * The variant on screen, as the title of the page names it: its lifecycle's
 * mark, its name and where it stands, in the words of its row.
 * @param props The variant on the timeline.
 * @param props.entry The variant on the timeline.
 * @returns The line.
 */
function VariantStanding(props: { readonly entry: TimelineEntry }): JSX.Element {
	const { entry } = props;
	return (
		<span data-slot="about-variant" className="flex min-w-0 items-center gap-1.5">
			<VariantMark lifecycle={entry.variant.lifecycle} />
			<span className="text-foreground truncate font-medium">{entry.variant.name}</span>
			<span className="text-muted-foreground shrink-0">{standingWords(entry)}</span>
		</span>
	);
}

/**
 * One variant on the timeline: its lane and mark, its name, where it stands
 * and why. Choosing it opens it in this pane. The current variant is asked for
 * as the absence of a variant, which is what an address with no variant in it
 * already means: naming it by id would pin the pane to a variant that stops
 * being current the moment somebody adopts a proposal.
 * @param props The variant, its lane, whether it is on screen and how to open it.
 * @param props.entry The variant on the timeline.
 * @param props.lane Its lane.
 * @param props.drawn Whether it is on screen.
 * @param props.onChoose Open it, when the pane can.
 * @param props.onBeside Open a variant beside, while the timeline offers it.
 * @returns The row.
 */
function TimelineRow(props: {
	readonly entry: TimelineEntry;
	readonly lane: Lane;
	readonly drawn: boolean;
	readonly onChoose: ((variant: string | null) => void) | undefined;
	readonly onBeside: ((variant: string) => void) | undefined;
}): JSX.Element {
	const { entry, lane, drawn, onChoose, onBeside } = props;
	const { variant } = entry;
	const markX = PAGE_LANE.origin + lane.depth * PAGE_LANE.step;
	const reason = reasonOf(entry);
	const rowStyle = useMemo(() => ({ paddingLeft: markX + TEXT_AFTER_MARK }), [markX]);
	const markStyle = useMemo(() => ({ left: markX - 8, top: PAGE_LANE.middle - 8 }), [markX]);
	const choose = useCallback(
		(): void => onChoose?.(variant.lifecycle === "current" ? null : variant.id),
		[onChoose, variant.id, variant.lifecycle],
	);
	return (
		<li className="relative flex min-w-0 items-stretch">
			<button
				type="button"
				aria-pressed={drawn}
				disabled={onChoose === undefined}
				data-slot="variant-entry"
				data-variant={variant.id}
				data-lifecycle={variant.lifecycle}
				onClick={choose}
				className="hover:bg-sidebar-accent/50 aria-pressed:bg-sidebar-accent aria-pressed:shadow-raised rounded-control relative flex min-w-0 flex-1 py-3 pr-4 text-left disabled:cursor-default"
				style={rowStyle}
			>
				{drawn && (
					<span
						aria-hidden="true"
						className="bg-primary-mark absolute inset-y-1.5 left-0 w-0.5 rounded-full"
					/>
				)}
				<TimelineLane lane={lane} geometry={PAGE_LANE} />
				<span
					aria-hidden="true"
					className="absolute flex size-4 items-center justify-center"
					style={markStyle}
				>
					<VariantMark lifecycle={variant.lifecycle} />
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex min-w-0 items-baseline gap-3">
						<span className="title-name truncate">{variant.name}</span>
						<span
							className={cn(
								"text-body shrink-0",
								variant.lifecycle === "current"
									? "text-foreground font-medium"
									: "text-muted-foreground",
							)}
						>
							{standingWords(entry)}
						</span>
						{drawn && (
							<span className="text-body text-primary-text ml-auto shrink-0 font-medium">
								On screen
							</span>
						)}
					</span>
					{reason !== undefined && (
						<span className="text-control text-muted-foreground max-w-[72ch] font-normal">
							{reason}
						</span>
					)}
				</span>
			</button>
			{onBeside !== undefined && <RowBeside entry={entry} drawn={drawn} onBeside={onBeside} />}
		</li>
	);
}

/**
 * The end of a row while the timeline offers to open beside: the control on a
 * draft or a shelved variant, and room kept on every other row, so the rows
 * stay one width.
 * @param props The variant, and the way to open it beside.
 * @param props.entry The variant on the timeline.
 * @param props.drawn Whether it is on screen, where nothing opens beside it.
 * @param props.onBeside Open a variant beside.
 * @returns The control, or the room for one.
 */
function RowBeside(props: {
	readonly entry: TimelineEntry;
	readonly drawn: boolean;
	readonly onBeside: (variant: string) => void;
}): JSX.Element {
	const { entry, onBeside } = props;
	const { variant } = entry;
	const open = useCallback((): void => onBeside(variant.id), [onBeside, variant.id]);
	const offered =
		!props.drawn && (variant.lifecycle === "draft" || variant.lifecycle === "shelved");
	return (
		<span className="flex w-11 shrink-0 items-center justify-center">
			{offered && (
				<IconButton
					label={`Open ${variant.name} beside`}
					tip="Open beside"
					slot="variant-beside"
					className="text-muted-foreground hover:text-foreground"
					onClick={open}
				>
					<RiLayoutColumnLine />
				</IconButton>
			)}
		</span>
	);
}

export { AboutVariants, VariantStanding, type AboutVariantsProps };
