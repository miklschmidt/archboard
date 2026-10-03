// The variants page and the walkthroughs page: how the board has changed, as
// one timeline with branches (the navigator's rail at the page's room), and
// how the author reads it aloud. Both are in the board's own words.

import { useCallback, useMemo, type JSX } from "react";

import type { Adoption, SemanticWalkthrough, Shelving } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";
import type { OfferedVariant } from "@/ui/semantic-board-canvas/lib/board-document";
import {
	variantTimeline,
	type TimelineEntry,
} from "@/ui/semantic-board-canvas/lib/variant-timeline";
import {
	TimelineLane,
	timelineLanes,
	VariantMark,
	type Lane,
	type LaneGeometry,
} from "@/ui/variant-lifecycle";

/** Inputs for the variants page. */
interface VariantsPageProps {
	/** Every variant of the board, in the order the board states them. */
	readonly variants: readonly OfferedVariant[];
	/** Every time the designation of the current architecture moved. */
	readonly adoptions: readonly Adoption[];
	/** Every time a proposal was let go. */
	readonly shelvings: readonly Shelving[];
	/** The id of the variant on screen, or null while that is not known. */
	readonly showing: string | null;
	/**
	 * The person chose a variant to read.
	 * @param variant The variant's id.
	 */
	readonly onChoose: ((variant: string) => void) | undefined;
}

/** Where the timeline's columns are: the navigator's rail, at the page's room. */
const PAGE_LANE: LaneGeometry = { origin: 24, step: 28, middle: 26, clearance: 11 };

/** The text column starts this far right of the deepest mark on its row. */
const TEXT_AFTER_MARK = 22;

/**
 * The board's variants as a timeline: the adopted line from the current
 * variant back through its history, each at its adoption with its date and
 * its reason; drafts branching off the variant they came from; a shelved
 * variant ending its branch with its reason.
 * @param props The variants, the record of the board and the one on screen.
 * @returns The page.
 */
function VariantsPage(props: VariantsPageProps): JSX.Element {
	const timeline = useMemo(
		() => variantTimeline(props.variants, props.adoptions, props.shelvings),
		[props.variants, props.adoptions, props.shelvings],
	);
	const lanes = useMemo(
		() => timelineLanes(timeline.entries.map((entry) => entry.depth)),
		[timeline],
	);
	return (
		<section aria-label="Variants" className="flex max-w-[64rem] flex-col">
			{!timeline.built && (
				<p className="text-control text-muted-foreground mb-3">
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
					/>
				))}
			</ol>
		</section>
	);
}

/**
 * What a variant's row says of it under its name: where it stands, when the
 * record says it got there, and what it came from.
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
 * One variant on the timeline: its lane and mark, its name, where it stands
 * and why. Choosing it opens it in this pane.
 * @param props The variant, its lane, whether it is on screen and how to open it.
 * @param props.entry The variant on the timeline.
 * @param props.lane Its lane.
 * @param props.drawn Whether it is on screen.
 * @param props.onChoose Open it, when the pane can.
 * @returns The row.
 */
function TimelineRow(props: {
	readonly entry: TimelineEntry;
	readonly lane: Lane;
	readonly drawn: boolean;
	readonly onChoose: ((variant: string) => void) | undefined;
}): JSX.Element {
	const { entry, lane, drawn, onChoose } = props;
	const { variant } = entry;
	const markX = PAGE_LANE.origin + lane.depth * PAGE_LANE.step;
	const reason = reasonOf(entry);
	const choose = useCallback((): void => onChoose?.(variant.id), [onChoose, variant.id]);
	return (
		<li className="relative">
			<button
				type="button"
				aria-pressed={drawn}
				disabled={onChoose === undefined}
				data-slot="variant-entry"
				data-variant={variant.id}
				data-lifecycle={variant.lifecycle}
				onClick={choose}
				className="hover:bg-sidebar-accent/50 aria-pressed:bg-sidebar-accent aria-pressed:shadow-raised rounded-control relative flex w-full min-w-0 py-3 pr-4 text-left disabled:cursor-default"
				style={{ paddingLeft: markX + TEXT_AFTER_MARK }}
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
					style={{ left: markX - 8, top: PAGE_LANE.middle - 8 }}
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
		</li>
	);
}

/** Inputs for the walkthroughs page. */
interface WalkthroughsPageProps {
	/** Every explanation the variant states. */
	readonly walkthroughs: readonly SemanticWalkthrough[];
	/**
	 * The person chose a step of a walkthrough to read.
	 * @param walkthrough The walkthrough's id.
	 * @param beat Which step, counted from zero.
	 */
	readonly onChoose: (walkthrough: string, beat: number) => void;
}

/** Inputs for one walkthrough's card. */
interface WalkthroughCardProps extends WalkthroughsPageProps {
	readonly walkthrough: SemanticWalkthrough;
}

/**
 * One walkthrough: its name, how many steps it has, and the steps, each of
 * which presents the walkthrough from there.
 * @param props The walkthrough and how to read it.
 * @returns The card.
 */
function WalkthroughCard(props: WalkthroughCardProps): JSX.Element {
	const { walkthrough } = props;
	const count = walkthrough.beats.length;
	return (
		<li className="border-border bg-card shadow-card rounded-panel min-w-0 border p-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="title-name truncate">{walkthrough.name}</h3>
				<span className="text-body text-muted-foreground shrink-0">
					{count} {count === 1 ? "step" : "steps"}
				</span>
			</div>
			{walkthrough.summary !== undefined && (
				<p className="text-control text-muted-foreground mt-2">{walkthrough.summary}</p>
			)}
			<ol className="mt-3">
				{walkthrough.beats.map((beat, index) => (
					<li key={beat.id} className={cn("border-border border-t")}>
						<button
							type="button"
							data-slot="walkthrough-beat"
							onClick={() => props.onChoose(walkthrough.id, index)}
							className="text-control hover:bg-muted/60 rounded-control -mx-2 flex min-h-9 w-[calc(100%+16px)] items-center gap-3 px-2 py-1.5 text-left"
						>
							<span className="text-technical text-muted-foreground w-4 shrink-0 font-mono">
								{index + 1}
							</span>
							<span className="min-w-0">{beat.heading}</span>
						</button>
					</li>
				))}
			</ol>
		</li>
	);
}

/**
 * The explanations this variant gives of itself.
 * @param props The walkthroughs and how to read one.
 * @returns The page.
 */
function WalkthroughsPage(props: WalkthroughsPageProps): JSX.Element {
	if (props.walkthroughs.length === 0) {
		return (
			<p className="text-muted-foreground text-control py-2">This variant has no walkthrough.</p>
		);
	}
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(360px,460px))] gap-3">
			{props.walkthroughs.map((walkthrough) => (
				<WalkthroughCard key={walkthrough.id} {...props} walkthrough={walkthrough} />
			))}
		</ul>
	);
}

export { VariantsPage, WalkthroughsPage, type VariantsPageProps, type WalkthroughsPageProps };
