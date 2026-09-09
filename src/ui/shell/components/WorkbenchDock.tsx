// The bottom workbench dock: a 40px header with connection, claim and the
// current `doing` line and a disclosure, and a 320px body for the workbench
// (TASK-150.05). The recent activity lives in the workbench's session column;
// when no workbench rides the pane, the dock body shows it beside a line
// saying so, so a person never loses the agent's narration.

import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { useCallback, useState, type JSX, type ReactNode } from "react";

import { Collapsible, CollapsibleContent } from "@/ui/components/collapsible";
import { agentClaim } from "@/ui/shell/components/ClaimBanner";
import type { ShellPane, TakeBackState } from "@/ui/shell/types/contracts";
import { IconButton } from "@/ui/shell/components/IconButton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import { clockTime } from "@/ui/shell/lib/time";
import type { DoingEntry } from "@/ui/types";

/** Inputs for the dock. */
interface WorkbenchDockProps {
	/** The pane the dock describes, or null when none is open. */
	pane: ShellPane | null;
	paneCount: number;
	/** The workbench's compact controls, kept reachable while collapsed. */
	headerControls: ReactNode;
	/** The workbench itself, or null while no workbench rides this pane. */
	body: ReactNode;
	/** The recent activity, shown here only while no workbench rides the pane. */
	activity: ReactNode;
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
function DoingLine(props: DoingLineProps): JSX.Element {
	const { entry } = props;
	if (!entry) {
		return (
			<span className="text-muted-foreground text-control font-normal">Nothing in progress</span>
		);
	}
	return (
		<span className="text-control flex min-w-0 items-baseline gap-2">
			<span className="truncate">{entry.doing}</span>
			<time dateTime={entry.at} className="text-muted-foreground text-technical shrink-0 font-mono">
				{clockTime(entry.at)}
			</time>
		</span>
	);
}

/** Inputs for the take-back state line. */
interface TakeBackLineProps {
	state: TakeBackState;
}

/**
 * Where the take-back operation stands, when it is not idle: a live line so
 * the words are heard as well as seen.
 * @param props The state.
 * @returns A short line, or nothing while idle.
 */
function TakeBackLine(props: TakeBackLineProps): JSX.Element | null {
	const { state } = props;
	if (state.kind === "idle") {
		return null;
	}
	const failed = state.kind === "failed";
	return (
		<span
			aria-live="polite"
			className={`text-body flex min-w-0 items-center gap-1.5 ${failed ? "text-foreground" : "text-muted-foreground"}`}
		>
			<StatusDot tone={failed ? "warning" : "live"} />
			<span className="truncate">{failed ? state.message : "Taking back control…"}</span>
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
 * The dock's state dot: lime while connected, pulsing only while an agent works.
 * @param props Connection and activity.
 * @returns The dot.
 */
function ActivityDot(props: ActivityDotProps): JSX.Element {
	return (
		<StatusDot
			tone={props.connected ? "live" : "idle"}
			className={props.active ? "motion-safe:animate-pulse" : undefined}
		/>
	);
}

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
function DockActivity(props: DockStateProps): JSX.Element {
	const { pane } = props;
	const claim = pane ? agentClaim(pane.holder) : null;
	return (
		<>
			<ActivityDot connected={pane?.status.connected === true} active={claim !== null} />
			<span className="text-kicker shrink-0 uppercase">Agent workbench</span>
			<DoingLine entry={pane?.status.doing.at(-1) ?? null} />
		</>
	);
}

/**
 * The take-back state and the pane count.
 * @param props The pane and the pane count.
 * @returns The right part of the dock header.
 */
function DockCounts(props: DockStateProps): JSX.Element {
	const { pane, paneCount } = props;
	return (
		<>
			{pane && <TakeBackLine state={pane.takeBack} />}
			<span className="text-muted-foreground text-technical shrink-0">
				<span className="font-mono">{paneCount}</span> {paneCount === 1 ? "pane" : "panes"}
			</span>
		</>
	);
}

/** Inputs for the body shown while no workbench rides the pane. */
interface DetachedBodyProps {
	activity: ReactNode;
}

/**
 * The dock body without a workbench: the recent activity in the session
 * column's place, and one line saying why the rest is empty.
 * @param props The recent activity.
 * @returns The two-column fallback.
 */
function DetachedBody(props: DetachedBodyProps): JSX.Element {
	return (
		<div className="flex h-full min-h-0">
			<section
				aria-label="Activity"
				className="border-border flex w-[260px] shrink-0 flex-col gap-2 overflow-y-auto border-r px-3 pb-3"
			>
				<div className="flex h-8 shrink-0 items-center">
					<h2 className="text-kicker text-muted-foreground uppercase">Activity</h2>
				</div>
				{props.activity ?? (
					<p className="text-muted-foreground text-body">Nothing said about this board yet.</p>
				)}
			</section>
			<p className="text-muted-foreground text-body flex min-w-0 flex-1 items-center justify-center px-6 text-center">
				No agent workbench is attached to this pane. Agent activity on the board still shows here.
			</p>
		</div>
	);
}

/**
 * The workbench dock.
 * @param props The pane the dock describes, the pane count and the slots.
 * @returns The collapsible dock.
 */
function WorkbenchDock(props: WorkbenchDockProps): JSX.Element {
	const { pane, paneCount } = props;
	const [open, setOpen] = useState(true);
	const handleToggle = useCallback(() => setOpen((value) => !value), []);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-border bg-background shrink-0 border-t"
		>
			<div className="bg-sidebar flex h-10 items-center gap-3 pr-2 pl-4">
				<DockActivity pane={pane} paneCount={paneCount} />
				<span className="flex-1" />
				<DockCounts pane={pane} paneCount={paneCount} />
				{props.headerControls}
				<IconButton
					label={open ? "Collapse workbench" : "Expand workbench"}
					expanded={open}
					className="text-muted-foreground"
					onClick={handleToggle}
				>
					{open ? <RiArrowDownSLine /> : <RiArrowUpSLine />}
				</IconButton>
			</div>
			<CollapsibleContent>
				<div className="border-border h-80 min-h-0 border-t">
					{props.body ?? <DetachedBody activity={props.activity} />}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

export { WorkbenchDock, type WorkbenchDockProps };
