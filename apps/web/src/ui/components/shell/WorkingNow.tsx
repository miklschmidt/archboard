// Where agents are working, whether or not anybody has the board open
// (ADR 0022): one entry per board an agent claims or has just written, with
// what it last said it was doing and how long ago. Gathered at the foot of the
// navigator so the tree above never grows or reorders because of activity.
// Entries keep the order they arrived in; the block is absent when nothing is
// live. Its lamps sit in the tree's marker column and its words start where
// the names of the top rows start.

import { useCallback, useState, type JSX, type MouseEvent } from "react";

import { SHELL_CLOCK_MS } from "@archboard/timing";
import { ActivityLamp } from "#ui/components/shell/ActivityLamp.tsx";
import { PaneChips } from "#ui/components/shell/PaneChips.tsx";
import { RepositoryName } from "@archboard/ui-kit/components";
import { shortAge, useClock } from "@archboard/ui-kit/time";
import {
	FACTS_GAP,
	FACTS_INSET,
	MARKER_WIDTH,
	markerX,
	NAME_GAP,
	nameX,
	ROW_GUTTER,
} from "#ui/rules/shell/tree-grid.ts";
import type { AgentActivityEntry } from "#ui/rules/pane-session/session-types.ts";

/** The heading starts where the names do. */
const HEADING_STYLE = { paddingLeft: nameX(0) } as const;

/** The list keeps the tree's gutter. */
const LIST_STYLE = { paddingInline: ROW_GUTTER } as const;

/** An entry's lamp in the marker column and its facts on the tree's right edge. */
const ENTRY_STYLE = {
	paddingLeft: markerX(0) - ROW_GUTTER,
	paddingRight: FACTS_INSET - ROW_GUTTER,
} as const;

/** The lamp's column, as wide as the tree's marker column. */
const LAMP_STYLE = { width: MARKER_WIDTH } as const;

/** The name keeps the tree's gap from the marker column. */
const NAME_GAP_STYLE = { marginLeft: NAME_GAP } as const;

/** The facts keep the tree's gap from the name. */
const FACTS_STYLE = { marginLeft: FACTS_GAP } as const;

/** The doing line starts where the name does. */
const DOING_STYLE = { paddingLeft: nameX(0) - markerX(0) } as const;

/** One entry as the block draws it. */
interface WorkingEntry {
	readonly activity: AgentActivityEntry;
	/** The board's name as the vault lists it, or its key while unlisted. */
	readonly name: string;
	/** The repository the board is in (ADR 0050). */
	readonly repository: string;
	/** Whether the entry names its repository: the navigator lists more than one. */
	readonly named: boolean;
	/** The letters of the panes showing it, when there are two. */
	readonly onScreen: readonly string[];
}

/** Inputs for the block. */
interface WorkingNowProps {
	readonly entries: readonly WorkingEntry[];
	/** Open a board of a repository, in the active pane or beside it. */
	readonly onOpen: (board: string, beside: boolean, repository: string) => void;
}

/**
 * The key an entry is kept by: two repositories can each have a board of one name.
 * @param entry The entry.
 * @returns The key.
 */
function entryKey(entry: WorkingEntry): string {
	return `${entry.repository}|${entry.activity.board}`;
}

/**
 * The boards in the order they first appeared, so a new entry never moves the others.
 * @param entries The entries now.
 * @returns The entries in arrival order.
 */
function useArrivalOrder(entries: readonly WorkingEntry[]): WorkingEntry[] {
	const [order, setOrder] = useState<readonly string[]>([]);
	const keys = entries.map(entryKey);
	const kept = order.filter((key) => keys.includes(key));
	const next = [...kept, ...keys.filter((key) => !kept.includes(key))];
	if (next.length !== order.length || next.some((key, index) => key !== order[index])) {
		setOrder(next);
	}
	return next.flatMap((key) => entries.filter((entry) => entryKey(entry) === key));
}

/**
 * Where agents are working.
 * @param props The entries and the open handler.
 * @returns The block, or nothing while no agent works anywhere.
 */
function WorkingNow(props: WorkingNowProps): JSX.Element | null {
	const ordered = useArrivalOrder(props.entries);
	const now = useClock(SHELL_CLOCK_MS.ageTick, ordered.length > 0);
	if (ordered.length === 0) return null;
	return (
		<section
			aria-label="Working now"
			data-slot="working-now"
			className="border-border flex max-h-[45%] shrink-0 flex-col border-t"
		>
			<h2
				style={HEADING_STYLE}
				className="text-body text-muted-foreground flex h-8 shrink-0 items-center gap-1.5 font-medium"
			>
				Working now
				<span className="font-mono">{ordered.length}</span>
			</h2>
			<ul style={LIST_STYLE} className="flex min-h-0 flex-col overflow-y-auto pb-2">
				{ordered.map((entry) => (
					<WorkingItem key={entryKey(entry)} entry={entry} now={now} onOpen={props.onOpen} />
				))}
			</ul>
		</section>
	);
}

/** Inputs for one entry. */
interface WorkingItemProps {
	readonly entry: WorkingEntry;
	readonly now: number;
	readonly onOpen: (board: string, beside: boolean, repository: string) => void;
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
	const { repository } = entry;
	const { said, at } = lastWords(entry.activity);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => onOpen(board, event.altKey, repository),
		[onOpen, board, repository],
	);
	return (
		<li>
			<button
				type="button"
				onClick={handleClick}
				style={ENTRY_STYLE}
				className="hover:bg-sidebar-accent rounded-control flex w-full min-w-0 flex-col gap-0.5 py-1.5 text-left"
			>
				<span className="flex w-full min-w-0 items-center">
					<span style={LAMP_STYLE} className="flex shrink-0 justify-center">
						<ActivityLamp state={claim === null ? "wrote" : "claimed"} />
					</span>
					<span style={NAME_GAP_STYLE} className="text-control min-w-0 flex-1 truncate">
						<span className="font-medium">{entry.name}</span>
						{entry.named ? (
							<span className="text-muted-foreground">
								<span className="sr-only">, in</span> <RepositoryName identity={repository} />
							</span>
						) : null}
					</span>
					<span style={FACTS_STYLE} className="flex shrink-0 items-center gap-1.5">
						<PaneChips letters={entry.onScreen} />
						<Age at={at} now={now} />
					</span>
				</span>
				<span style={DOING_STYLE} className="text-body text-muted-foreground truncate">
					<span className="sr-only">{claim === null ? "Just wrote: " : "Claimed: "}</span>
					{said}
				</span>
			</button>
		</li>
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
