// The thread queue: ordered submissions with move, remove and send-now, the
// queue's own pending or recovery state, and the command the controller has
// on the wire or last settled, in a footer that never pushes the rows.

import {
	RiArrowDownSLine,
	RiArrowUpSLine,
	RiDeleteBinLine,
	RiSendPlaneLine,
} from "@remixicon/react";
import { useCallback } from "react";

import type { BrowserQueue } from "@/shared/codex-browser-model";
import type { WorkbenchQueueActions, WorkbenchQueueCommandView } from "@/ui/workbench/contracts";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { PanelLine } from "@/ui/workbench/components/PanelLine";
import {
	queueEntryActions,
	queueEntryStatusText,
	queueStateText,
} from "@/ui/workbench/queue-projection";
import type { QueueEntryActions } from "@/ui/workbench/queue-projection";

type QueueEntry = BrowserQueue["entries"][number];

/** Inputs for the panel. */
interface QueuePanelProps {
	queue: BrowserQueue;
	/** Whether a workhorse thread is linked: without one there is nothing to queue onto. */
	linked: boolean;
	/** The controller's command state; idle when no controller reports one. */
	command: WorkbenchQueueCommandView;
	actions: WorkbenchQueueActions;
}

/** Inputs for one row. */
interface QueueRowProps {
	entry: QueueEntry;
	position: number;
	/** The ownership marker, or null when the controller reports none. */
	ownership: string | null;
	available: QueueEntryActions;
	actions: WorkbenchQueueActions;
}

/**
 * One queued submission with its actions.
 * @param props The entry, its position, its ownership, what it may do, and the callbacks.
 * @returns A list item.
 */
function QueueRow(props: QueueRowProps): React.JSX.Element {
	const { entry, actions, available } = props;
	const id = entry.submissionId;
	const moveUp = useCallback(() => actions.moveUp(id), [actions, id]);
	const moveDown = useCallback(() => actions.moveDown(id), [actions, id]);
	const remove = useCallback(() => actions.remove(id), [actions, id]);
	const sendNow = useCallback(() => actions.sendNow(id), [actions, id]);
	return (
		<li className="flex items-start gap-2 py-2">
			<span className="text-technical text-muted-foreground w-4 shrink-0 pt-px text-right font-mono">
				{props.position}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-body line-clamp-2 break-words">{entry.prompt}</span>
				<span className="text-technical text-muted-foreground truncate font-mono">
					{queueEntryStatusText(entry.status)}
					{entry.operationId === null ? "" : ` · ${entry.operationId}`}
					{props.ownership === null ? "" : ` · ${props.ownership}`}
				</span>
			</span>
			<span className="-my-0.5 flex shrink-0 items-center">
				<IconAction label="Move up" disabled={!available.moveUp} onClick={moveUp}>
					<RiArrowUpSLine />
				</IconAction>
				<IconAction label="Move down" disabled={!available.moveDown} onClick={moveDown}>
					<RiArrowDownSLine />
				</IconAction>
				<IconAction label="Send now" disabled={!available.sendNow} onClick={sendNow}>
					<RiSendPlaneLine />
				</IconAction>
				<IconAction label="Remove" disabled={!available.remove} onClick={remove}>
					<RiDeleteBinLine />
				</IconAction>
			</span>
		</li>
	);
}

/** Inputs for the command line. */
interface CommandLineProps {
	command: WorkbenchQueueCommandView;
}

/**
 * What the controller has on the wire, or how the last command settled. A
 * refusal is a real failure; an unknown outcome is not yet one.
 * @param props The command state.
 * @returns The line, or nothing while idle with no settlement.
 */
function CommandLine(props: CommandLineProps): React.JSX.Element | null {
	const { pending, settlement } = props.command;
	if (pending !== null) {
		return (
			<PanelLine tone="live" live>
				{pending}
			</PanelLine>
		);
	}
	if (settlement === null) {
		return null;
	}
	return (
		<PanelLine tone={settlement.tone === "refused" ? "failure" : "muted"} live>
			{settlement.message}
		</PanelLine>
	);
}

/** Inputs for the queue's own state line. */
interface QueueStateLineProps {
	queue: BrowserQueue;
	linked: boolean;
}

/**
 * The queue's state in words, saying why when nothing can be queued: no
 * workhorse to queue onto, or a host that is recovering.
 * @param props The queue and whether a thread is linked.
 * @returns One line.
 */
function QueueStateLine(props: QueueStateLineProps): React.JSX.Element {
	const state = queueStateText(props.queue);
	if (state.recovering && !props.linked && props.queue.entries.length === 0) {
		return <PanelLine tone="muted">Link a workhorse thread to queue work</PanelLine>;
	}
	return (
		<PanelLine tone="muted">
			{state.text}
			{state.recovering ? " — actions resume when the host recovers" : ""}
		</PanelLine>
	);
}

/**
 * The queue panel: the state line and the rows scroll; the command line
 * sits in a footer of its own.
 * @param props The queue, the link state, the command state and the callbacks.
 * @returns The scrolling body and the footer.
 */
function QueuePanel(props: QueuePanelProps): React.JSX.Element {
	const { queue, command } = props;
	const settled = command.pending !== null || command.settlement !== null;
	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
				<QueueStateLine queue={queue} linked={props.linked} />
				{queue.entries.length === 0 ? null : (
					<ol aria-label="Queued submissions" className="divide-border mt-1 divide-y">
						{queue.entries.map((entry, index) => (
							<QueueRow
								key={entry.submissionId}
								entry={entry}
								position={index + 1}
								ownership={command.ownership[entry.submissionId] ?? null}
								available={queueEntryActions(queue, index)}
								actions={props.actions}
							/>
						))}
					</ol>
				)}
			</div>
			{settled && (
				<footer className="border-border bg-sidebar shrink-0 border-t px-3 py-1.5">
					<CommandLine command={command} />
				</footer>
			)}
		</>
	);
}

export { QueuePanel, type QueuePanelProps };
