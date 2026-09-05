// The thread queue: ordered submissions with move, remove and send-now, and
// the queue's own pending or recovery state.

import {
	RiArrowDownSLine,
	RiArrowUpSLine,
	RiDeleteBinLine,
	RiSendPlaneLine,
} from "@remixicon/react";
import { useCallback } from "react";

import type { BrowserQueue } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import type { WorkbenchQueueActions } from "@/ui/workbench/contracts";
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
	actions: WorkbenchQueueActions;
}

/** Inputs for one row. */
interface QueueRowProps {
	entry: QueueEntry;
	position: number;
	available: QueueEntryActions;
	actions: WorkbenchQueueActions;
}

/**
 * One queued submission with its actions.
 * @param props The entry, its position, what it may do, and the callbacks.
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
		<li className="flex items-start gap-2 py-1.5 text-xs">
			<span className="text-muted-foreground w-4 shrink-0 font-mono">{props.position}</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="line-clamp-2 break-words">{entry.prompt}</span>
				<span className="text-muted-foreground font-mono text-[11px]">
					{queueEntryStatusText(entry.status)}
					{entry.operationId === null ? "" : ` · ${entry.operationId}`}
				</span>
			</span>
			<span className="flex shrink-0 items-center">
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Move up"
					disabled={!available.moveUp}
					onClick={moveUp}
				>
					<RiArrowUpSLine />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Move down"
					disabled={!available.moveDown}
					onClick={moveDown}
				>
					<RiArrowDownSLine />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Send now"
					disabled={!available.sendNow}
					onClick={sendNow}
				>
					<RiSendPlaneLine />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Remove"
					disabled={!available.remove}
					onClick={remove}
				>
					<RiDeleteBinLine />
				</Button>
			</span>
		</li>
	);
}

/**
 * The queue panel.
 * @param props The queue and the callbacks.
 * @returns The state line and the ordered list.
 */
function QueuePanel(props: QueuePanelProps): React.JSX.Element {
	const { queue } = props;
	const state = queueStateText(queue);
	return (
		<div className="flex flex-col gap-1">
			<p
				className={state.recovering ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
			>
				{state.text}
				{state.recovering ? " — actions resume when the host recovers" : ""}
			</p>
			{queue.entries.length === 0 ? null : (
				<ol aria-label="Queued submissions" className="divide-border divide-y">
					{queue.entries.map((entry, index) => (
						<QueueRow
							key={entry.submissionId}
							entry={entry}
							position={index + 1}
							available={queueEntryActions(queue, index)}
							actions={props.actions}
						/>
					))}
				</ol>
			)}
		</div>
	);
}

export { QueuePanel, type QueuePanelProps };
