// The bottom workbench dock: connection, claim and `doing` data in a header
// row, and a body reserved for the thread (TASK-150.05).

import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";
import { useCallback, useState } from "react";

import { Button } from "@/ui/components/button";
import { Collapsible, CollapsibleContent } from "@/ui/components/collapsible";
import type { ShellPane } from "@/ui/shell/lib/contracts";
import { StatusDot } from "@/ui/shell/lib/status-dot";
import type { DoingEntry } from "@/ui/types";

/** Inputs for the dock and its activity line. */
interface WorkbenchDockProps {
	/** The pane the dock describes, or null when none is open. */
	pane: ShellPane | null;
}

/**
 * The most recent `doing` line, which is the last entry.
 * @param pane The pane, or null when none is open.
 * @returns The entry, or null when nobody has said anything.
 */
function latestDoing(pane: ShellPane | null): DoingEntry | null {
	const entries = pane?.status.doing ?? [];
	return entries.at(-1) ?? null;
}

/**
 * The current activity line: what the agent said it was doing, and when.
 * @param props The pane.
 * @returns The line, or a quiet placeholder.
 */
function DoingLine(props: WorkbenchDockProps): React.JSX.Element {
	const entry = latestDoing(props.pane);
	if (!entry) {
		return <span className="text-muted-foreground text-sm">Nothing in progress</span>;
	}
	return (
		<span className="flex min-w-0 items-baseline gap-2 text-sm">
			<span className="truncate">{entry.doing}</span>
			<time dateTime={entry.at} className="text-muted-foreground shrink-0 font-mono text-xs">
				{entry.at.slice(11, 19)}
			</time>
		</span>
	);
}

/**
 * The workbench dock.
 * @param props The pane the dock describes.
 * @returns The collapsible dock.
 */
function WorkbenchDock(props: WorkbenchDockProps): React.JSX.Element {
	const [open, setOpen] = useState(true);
	const handleToggle = useCallback(() => setOpen((value) => !value), []);
	const connected = props.pane?.status.connected === true;
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-border bg-background shrink-0 border-t"
		>
			<div className="flex h-10 items-center gap-3 px-3">
				<StatusDot tone={connected ? "live" : "idle"} />
				<span className="text-[11px] font-medium tracking-wide uppercase">Agent workbench</span>
				<DoingLine pane={props.pane} />
				<span className="flex-1" />
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
				<section
					aria-label="Workbench thread"
					className="border-border text-muted-foreground flex h-40 items-center justify-center border-t text-sm"
				>
					Workbench presentation arrives with the text and voice workbench.
				</section>
			</CollapsibleContent>
		</Collapsible>
	);
}

export { WorkbenchDock, type WorkbenchDockProps };
