// The bottom workbench dock: connection, claim and `doing` data in a header
// row with a disclosure, and a body reserved for the thread (TASK-150.05).

import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { useCallback, useState } from "react";

import { Button } from "@/ui/components/button";
import { Collapsible, CollapsibleContent } from "@/ui/components/collapsible";
import { agentClaim } from "@/ui/shell/lib/claim-banner";
import type { ShellPane, TakeBackState } from "@/ui/shell/lib/contracts";
import { StatusDot } from "@/ui/shell/lib/status-dot";
import { clockTime } from "@/ui/shell/lib/time";
import type { DoingEntry } from "@/ui/types";

/** How many `doing` lines the disclosure shows. */
const DOING_LINES = 4;

/** Inputs for the dock. */
interface WorkbenchDockProps {
	/** The pane the dock describes, or null when none is open. */
	pane: ShellPane | null;
	paneCount: number;
	/** The workbench's compact controls, kept reachable while collapsed. */
	headerControls: React.ReactNode;
	/** The workbench itself, or null while no workbench rides this pane. */
	body: React.ReactNode;
}

/**
 * The last few `doing` lines, oldest first.
 * @param pane The pane, or null when none is open.
 * @returns At most `DOING_LINES` entries.
 */
function recentDoing(pane: ShellPane | null): DoingEntry[] {
	return (pane?.status.doing ?? []).slice(-DOING_LINES);
}

/** Inputs for the current activity line. */
interface DoingLineProps {
	entry: DoingEntry | null;
}

/**
 * The current activity line: what was last said, and when.
 * @param props The latest entry.
 * @returns The line, or a quiet placeholder.
 */
function DoingLine(props: DoingLineProps): React.JSX.Element {
	const { entry } = props;
	if (!entry) {
		return <span className="text-muted-foreground text-sm">Nothing in progress</span>;
	}
	return (
		<span className="flex min-w-0 items-baseline gap-2 text-sm">
			<span className="truncate">{entry.doing}</span>
			<time dateTime={entry.at} className="text-muted-foreground shrink-0 font-mono text-xs">
				{clockTime(entry.at)}
			</time>
		</span>
	);
}

/** Inputs for the `doing` history. */
interface DoingHistoryProps {
	entries: readonly DoingEntry[];
}

/**
 * The last few `doing` lines, oldest first, each naming who said it.
 * @param props The entries.
 * @returns A list, or nothing when nobody has said anything.
 */
function DoingHistory(props: DoingHistoryProps): React.JSX.Element | null {
	if (props.entries.length === 0) {
		return null;
	}
	return (
		<ol aria-label="Recent activity" className="flex flex-col gap-1 px-3 py-2 text-sm">
			{props.entries.map((entry) => (
				<li key={`${entry.by}:${entry.at}`} className="flex items-baseline gap-2">
					<time dateTime={entry.at} className="text-muted-foreground shrink-0 font-mono text-xs">
						{clockTime(entry.at)}
					</time>
					<span className="text-muted-foreground shrink-0 text-xs">
						{entry.kind === "agent" ? "agent" : "human"}
					</span>
					<span className="truncate">{entry.doing}</span>
				</li>
			))}
		</ol>
	);
}

/** Inputs for the take-back state line. */
interface TakeBackLineProps {
	state: TakeBackState;
}

/**
 * Where the take-back operation stands, when it is not idle.
 * @param props The state.
 * @returns A short line, or nothing while idle.
 */
function TakeBackLine(props: TakeBackLineProps): React.JSX.Element | null {
	const { state } = props;
	if (state.kind === "idle") {
		return null;
	}
	return (
		<span
			className={
				state.kind === "failed" ? "text-destructive text-xs" : "text-muted-foreground text-xs"
			}
		>
			{state.kind === "failed" ? state.message : "Taking back control"}
		</span>
	);
}

/** Inputs for the activity dot. */
interface ActivityDotProps {
	connected: boolean;
	/** A claimed agent is working: the dot pulses, unless motion is reduced. */
	active: boolean;
}

/**
 * The dock's state dot: lime while connected, pulsing while an agent works.
 * @param props Connection and activity.
 * @returns The dot.
 */
function ActivityDot(props: ActivityDotProps): React.JSX.Element {
	return (
		<StatusDot
			tone={props.connected ? "live" : "idle"}
			className={props.active ? "motion-safe:animate-pulse" : undefined}
		/>
	);
}

/**
 * The workbench dock.
 * @param props The pane the dock describes and the pane count.
 * @returns The collapsible dock.
 */
/** Inputs for the dock's state cluster. */
interface DockStateProps {
	pane: ShellPane | null;
	paneCount: number;
}

/**
 * The dot, the title and the latest `doing` line.
 * @param props The pane and the pane count.
 * @returns The left part of the dock header.
 */
function DockActivity(props: DockStateProps): React.JSX.Element {
	const { pane } = props;
	const claim = pane ? agentClaim(pane.holder) : null;
	return (
		<>
			<ActivityDot connected={pane?.status.connected === true} active={claim !== null} />
			<span className="shrink-0 text-[11px] font-medium tracking-wide uppercase">
				Agent workbench
			</span>
			<DoingLine entry={recentDoing(pane).at(-1) ?? null} />
		</>
	);
}

/**
 * The take-back state and the pane count.
 * @param props The pane and the pane count.
 * @returns The right part of the dock header.
 */
function DockCounts(props: DockStateProps): React.JSX.Element {
	const { pane, paneCount } = props;
	return (
		<>
			{pane && <TakeBackLine state={pane.takeBack} />}
			<span className="text-muted-foreground shrink-0 text-xs">
				<span className="font-mono">{paneCount}</span> {paneCount === 1 ? "pane" : "panes"}
			</span>
		</>
	);
}

/**
 * The workbench dock.
 * @param props The pane the dock describes and the pane count.
 * @returns The collapsible dock.
 */
function WorkbenchDock(props: WorkbenchDockProps): React.JSX.Element {
	const { pane, paneCount } = props;
	const [open, setOpen] = useState(true);
	const handleToggle = useCallback(() => setOpen((value) => !value), []);
	const entries = recentDoing(pane);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-border bg-background shrink-0 border-t"
		>
			<div className="flex h-10 items-center gap-3 px-3">
				<DockActivity pane={pane} paneCount={paneCount} />
				<span className="flex-1" />
				<DockCounts pane={pane} paneCount={paneCount} />
				{props.headerControls}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={open ? "Collapse workbench" : "Expand workbench"}
					aria-expanded={open}
					onClick={handleToggle}
				>
					{open ? <RiArrowDownSLine /> : <RiArrowUpSLine />}
				</Button>
			</div>
			<CollapsibleContent>
				<div className="border-border border-t">
					<DoingHistory entries={entries} />
				</div>
				<div className="border-border h-80 min-h-0 border-t">
					{props.body ?? (
						<p className="text-muted-foreground flex h-full items-center justify-center text-sm">
							No agent workbench is attached to this pane.
						</p>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export { WorkbenchDock, type WorkbenchDockProps };
