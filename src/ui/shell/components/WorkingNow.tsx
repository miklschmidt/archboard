// Where agents are working, whether or not anybody has the board open
// (ADR 0022): one entry per board an agent claims or has just written, with
// what it last said it was doing and how long ago. Gathered at the foot of the
// navigator so the tree above never grows or reorders because of activity.
// Entries keep the order they arrived in; the block is absent when nothing is
// live.

import { useCallback, useState, type JSX, type MouseEvent } from "react";

import { SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { PaneChips } from "@/ui/shell/components/PaneChips";
import { useClock } from "@/ui/shell/hooks/use-clock";
import { shortAge } from "@/ui/shell/lib/age";
import type { AgentActivityEntry } from "@/ui/types";

/** One entry as the block draws it. */
interface WorkingEntry {
	readonly activity: AgentActivityEntry;
	/** The board's name as the vault lists it, or its key while unlisted. */
	readonly name: string;
	/** The letters of the panes showing it, when there are two. */
	readonly onScreen: readonly string[];
}

/** Inputs for the block. */
interface WorkingNowProps {
	readonly entries: readonly WorkingEntry[];
	/** Open a board, in the active pane or beside it. */
	readonly onOpen: (board: string, beside: boolean) => void;
}

/**
 * The boards in the order they first appeared, so a new entry never moves the others.
 * @param entries The entries now.
 * @returns The entries in arrival order.
 */
function useArrivalOrder(entries: readonly WorkingEntry[]): WorkingEntry[] {
	const [order, setOrder] = useState<readonly string[]>([]);
	const keys = entries.map((entry) => entry.activity.board);
	const kept = order.filter((key) => keys.includes(key));
	const next = [...kept, ...keys.filter((key) => !kept.includes(key))];
	if (next.length !== order.length || next.some((key, index) => key !== order[index])) {
		setOrder(next);
	}
	return next.flatMap((key) => entries.filter((entry) => entry.activity.board === key));
}

/**
 * Where agents are working.
 * @param props The entries and the open handler.
 * @returns The block, or nothing while no agent works anywhere.
 */
function WorkingNow(props: WorkingNowProps): JSX.Element | null {
	const ordered = useArrivalOrder(props.entries);
	const now = useClock(SHELL_AGE_TICK_MS, ordered.length > 0);
	if (ordered.length === 0) return null;
	return (
		<section
			aria-label="Working now"
			data-slot="working-now"
			className="border-border flex max-h-[45%] shrink-0 flex-col border-t"
		>
			<h2 className="text-body text-muted-foreground flex h-8 shrink-0 items-center gap-1.5 px-4 font-medium">
				Working now
				<span className="font-mono">{ordered.length}</span>
			</h2>
			<ul className="flex min-h-0 flex-col overflow-y-auto px-2 pb-2">
				{ordered.map((entry) => (
					<WorkingItem key={entry.activity.board} entry={entry} now={now} onOpen={props.onOpen} />
				))}
			</ul>
		</section>
	);
}

/** Inputs for one entry. */
interface WorkingItemProps {
	readonly entry: WorkingEntry;
	readonly now: number;
	readonly onOpen: (board: string, beside: boolean) => void;
}

/**
 * What the agent last said about the board, and when: its doing line, else
 * the reason it gave for its claim.
 * @param activity The activity.
 * @returns The words and the stamp, which may be missing.
 */
function lastWords(activity: AgentActivityEntry): {
	readonly said: string;
	readonly at: string | null;
} {
	const { claim, doing } = activity;
	if (doing !== null) return { said: doing.doing, at: doing.at };
	return { said: claim?.reason ?? "Writing", at: claim?.since ?? null };
}

/**
 * One board an agent works on: its lamp, its name, how long ago the agent
 * spoke, and what it said.
 * @param props The entry, the clock and the open handler.
 * @returns The entry.
 */
function WorkingItem(props: WorkingItemProps): JSX.Element {
	const { entry, now, onOpen } = props;
	const { claim, board } = entry.activity;
	const { said, at } = lastWords(entry.activity);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => onOpen(board, event.altKey),
		[onOpen, board],
	);
	return (
		<li>
			<button
				type="button"
				onClick={handleClick}
				className="hover:bg-sidebar-accent flex w-full min-w-0 flex-col gap-0.5 rounded-[3px] px-2 py-1.5 text-left"
			>
				<span className="flex w-full min-w-0 items-center gap-2">
					<WorkLamp claimed={claim !== null} />
					<span className="text-control min-w-0 flex-1 truncate font-medium">{entry.name}</span>
					<PaneChips letters={entry.onScreen} />
					<Age at={at} now={now} />
				</span>
				<span className="text-body text-muted-foreground truncate pl-3.5">
					<span className="sr-only">{claim === null ? "Just wrote: " : "Claimed: "}</span>
					{said}
				</span>
			</button>
		</li>
	);
}

/**
 * The entry's lamp: lit for a claim, a ring for a write without one.
 * @param props Whether the agent claims the board.
 * @param props.claimed Whether it does.
 * @returns The lamp.
 */
function WorkLamp(props: { readonly claimed: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={
				props.claimed
					? "bg-status size-1.5 shrink-0 rounded-full motion-safe:animate-pulse"
					: "ring-status size-1.5 shrink-0 rounded-full ring-[1.5px]"
			}
		/>
	);
}

/**
 * How long ago the agent spoke.
 * @param props The stamp and the clock.
 * @param props.at When, or null.
 * @param props.now The clock.
 * @returns The age, or nothing.
 */
function Age(props: { readonly at: string | null; readonly now: number }): JSX.Element | null {
	if (props.at === null) return null;
	return (
		<time dateTime={props.at} className="text-technical text-muted-foreground shrink-0 font-mono">
			{shortAge(props.at, props.now)}
		</time>
	);
}

export { WorkingNow, type WorkingEntry, type WorkingNowProps };
