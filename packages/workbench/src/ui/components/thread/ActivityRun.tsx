// A run of work between two things the agent said: one row per step, each a
// kind, a label and how long it took, opening to its evidence. While the turn
// runs every row shows and the last one is live; once it ends, a run of more
// than a few steps folds to one line that says what it amounted to, unless a
// step failed — a failure never hides.

import {
	RiArrowRightSLine,
	RiCloseCircleLine,
	RiContractUpDownLine,
	RiFileEditLine,
	RiLightbulbFlashLine,
	RiLoader4Line,
	RiSearchLine,
	RiTerminalBoxLine,
	RiToolsLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";

import type { ActivityItem, ActivityRun as Run } from "#ui/rules/runtime/messages.ts";
import { ActivityEvidence, LineCounts } from "#ui/components/thread/ActivityEvidence.tsx";
import {
	activityLabel,
	lineTotals,
	reasoningParts,
	runSummary,
	shortDuration,
	stepFailed,
} from "#ui/rules/thread/activity-words.ts";

/** A run longer than this folds once its turn has ended. */
const FOLD_AFTER = 3;

/** The icon each kind of work is drawn with. */
const KIND_ICONS: Readonly<Record<ActivityItem["media"], RemixiconComponentType>> = {
	reasoning: RiLightbulbFlashLine,
	command: RiTerminalBoxLine,
	fileChange: RiFileEditLine,
	tool: RiToolsLine,
	search: RiSearchLine,
	compaction: RiContractUpDownLine,
};

/** Inputs for a run. */
interface ActivityRunProps {
	readonly run: Run;
}

/**
 * Whether a run folds to one line: once its turn has ended, when it is long
 * and nothing in it failed.
 * @param run The run.
 * @returns Whether it folds.
 */
function folds(run: Run): boolean {
	return run.ended && run.items.length > FOLD_AFTER && !run.items.some(stepFailed);
}

/**
 * A run of work.
 * @param props The run.
 * @returns The rows, or the one line they fold to.
 */
function ActivityRun(props: ActivityRunProps): JSX.Element {
	const { items, live } = props.run;
	const foldable = folds(props.run);
	const liveIndex = live ? items.length - 1 : -1;
	const [open, setOpen] = useState(false);
	const toggle = useCallback(() => setOpen((current) => !current), []);
	return (
		<section data-slot="activity" className="flex flex-col">
			{foldable && (
				<button
					type="button"
					aria-expanded={open}
					onClick={toggle}
					className="text-body text-muted-foreground hover:text-foreground rounded-control -mx-1.5 flex h-7 items-center gap-1.5 px-1.5 text-left"
				>
					<RiArrowRightSLine
						aria-hidden="true"
						className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
					/>
					{runSummary(items)}
				</button>
			)}
			{(!foldable || open) &&
				items.map((item, index) => (
					<ActivityRow key={item.itemId} item={item} live={index === liveIndex} nested={foldable} />
				))}
		</section>
	);
}

/** Inputs for one row. */
interface ActivityRowProps {
	readonly item: ActivityItem;
	/** The step the running turn is on now. */
	readonly live: boolean;
	/** Shown inside a folded run, so indented under its summary. */
	readonly nested: boolean;
}

/**
 * Whether a row has anything to open to.
 * @param item The step.
 * @returns True when it has evidence.
 */
function hasEvidence(item: ActivityItem): boolean {
	switch (item.media) {
		case "command":
			return [item.output, item.cwd, item.exitCode].some((fact) => fact !== null);
		case "fileChange":
			return item.changes.length > 0;
		case "tool":
			return [item.arguments, item.error].some((fact) => fact !== null);
		case "reasoning":
			return reasoningOpens(item.text);
		default:
			return false;
	}
}

/**
 * Whether a row is open: undefined when it has nothing to open to, else what
 * the person chose, else open exactly when the step failed.
 * @param item The step.
 * @param chosen What the person chose, or null.
 * @returns Whether it is open.
 */
function openState(item: ActivityItem, chosen: boolean | null): boolean | undefined {
	if (!hasEvidence(item)) return undefined;
	return chosen ?? stepFailed(item);
}

/**
 * Whether a reasoning summary says more than its row's headline.
 * @param text The summary.
 * @returns Whether it opens.
 */
function reasoningOpens(text: string): boolean {
	const { headline, body } = reasoningParts(text);
	return body !== "" && body !== headline;
}

/**
 * One step of work: its kind, what it was, and how long it took, opening to
 * its evidence. A step that fails opens itself.
 * @param props The step and whether it is live.
 * @returns The row.
 */
function ActivityRow(props: ActivityRowProps): JSX.Element {
	const { item, live } = props;
	// A step that fails opens itself, until the person opens or closes it.
	const [chosen, setChosen] = useState<boolean | null>(null);
	const open = openState(item, chosen);
	const toggle = useCallback(() => setChosen(open !== true), [open]);
	return (
		<div
			data-slot="activity-row"
			data-live={live || undefined}
			className={props.nested ? "pl-5" : ""}
		>
			<button
				type="button"
				disabled={open === undefined}
				aria-expanded={open}
				onClick={toggle}
				className="group/row enabled:hover:bg-muted/60 rounded-control -mx-1.5 flex h-7 w-[calc(100%+12px)] min-w-0 items-center gap-2 px-1.5 text-left"
			>
				<RowIcon item={item} live={live} />
				<RowLabel item={item} live={live} />
				<RowTrailer item={item} />
			</button>
			{open === true && (
				<div className="border-border mb-2 ml-[7px] border-l pt-1 pb-1 pl-[15px]">
					<ActivityEvidence item={item} />
				</div>
			)}
		</div>
	);
}

/**
 * The row's icon: the kind of work, a spinner while it is live, a cross when it failed.
 * @param props The step and whether it is live.
 * @param props.item The step.
 * @param props.live Whether it is the step the turn is on now.
 * @returns The icon.
 */
function RowIcon(props: { readonly item: ActivityItem; readonly live: boolean }): JSX.Element {
	if (props.live) {
		return (
			<RiLoader4Line
				aria-label="Running"
				className="text-foreground size-3.5 shrink-0 motion-safe:animate-spin"
			/>
		);
	}
	if (stepFailed(props.item)) {
		return <RiCloseCircleLine aria-label="Failed" className="text-destructive size-3.5 shrink-0" />;
	}
	const Icon = KIND_ICONS[props.item.media];
	return <Icon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />;
}

/**
 * The row's words: a command in the technical face, anything else as prose.
 * @param props The step and whether it is live.
 * @param props.item The step.
 * @param props.live Whether it is the step the turn is on now.
 * @returns The label.
 */
function RowLabel(props: { readonly item: ActivityItem; readonly live: boolean }): JSX.Element {
	const { item, live } = props;
	const technical = item.media === "command" || item.media === "tool";
	const words = activityLabel(item);
	return (
		<span
			title={words}
			className={`min-w-0 flex-1 truncate ${technical ? "text-technical font-mono" : "text-body"} ${live ? "text-foreground" : "text-muted-foreground group-hover/row:text-foreground"}`}
		>
			{words}
		</span>
	);
}

/**
 * The row's right-hand fact: lines changed, an exit code, or how long it took.
 * @param props The step.
 * @param props.item The step.
 * @returns The fact, or nothing.
 */
function RowTrailer(props: { readonly item: ActivityItem }): JSX.Element | null {
	const { item } = props;
	if (item.media === "fileChange" && item.changes.length > 0) {
		const totals = lineTotals(item);
		return <LineCounts added={totals.added} removed={totals.removed} />;
	}
	const exit = failedExit(item);
	if (exit !== null) {
		return <span className="text-technical text-destructive shrink-0 font-mono">exit {exit}</span>;
	}
	const duration = shortDuration("durationMs" in item ? item.durationMs : null);
	if (duration === null) return null;
	return (
		<span className="text-technical text-muted-foreground shrink-0 font-mono">{duration}</span>
	);
}

/**
 * The exit code of a command that failed.
 * @param item The step.
 * @returns The code, or null for anything else.
 */
function failedExit(item: ActivityItem): number | null {
	if (item.media !== "command" || item.exitCode === 0) return null;
	return item.exitCode;
}

export { ActivityRun, type ActivityRunProps };
