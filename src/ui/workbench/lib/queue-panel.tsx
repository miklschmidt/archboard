// The thread queue: ordered submissions with move, remove and send-now, the
// queue's own pending or recovery state, and the command the controller has
// on the wire or last settled.

import {
	RiArrowDownSLine,
	RiArrowUpSLine,
	RiDeleteBinLine,
	RiSendPlaneLine,
} from "@remixicon/react";
import { useCallback } from "react";

import type { BrowserQueue } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import type { WorkbenchQueueActions, WorkbenchQueueCommandView } from "@/ui/workbench/contracts";
import { PanelLine } from "@/ui/workbench/lib/panel-line";
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

/** Inputs for one row action. */
interface RowActionProps {
	label: string;
	enabled: boolean;
	onClick: () => void;
	children: React.ReactNode;
}

/**
 * A 24px icon action whose hit area reaches 32px (the documented desktop
 * exception to the 44px target), so dense rows stay dense and still tappable.
 * @param props The label, availability, callback and icon.
 * @returns The button.
 */
function RowAction(props: RowActionProps): React.JSX.Element {
	return (
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={props.label}
			disabled={!props.enabled}
			onClick={props.onClick}
			className="relative rounded-sm after:absolute after:-inset-1"
		>
			{props.children}
		</Button>
	);
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
				<RowAction label="Move up" enabled={available.moveUp} onClick={moveUp}>
					<RiArrowUpSLine />
				</RowAction>
				<RowAction label="Move down" enabled={available.moveDown} onClick={moveDown}>
					<RiArrowDownSLine />
				</RowAction>
				<RowAction label="Send now" enabled={available.sendNow} onClick={sendNow}>
					<RiSendPlaneLine />
				</RowAction>
				<RowAction label="Remove" enabled={available.remove} onClick={remove}>
					<RiDeleteBinLine />
				</RowAction>
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

/**
 * The queue panel.
 * @param props The queue, the command state and the callbacks.
 * @returns The state lines and the ordered list.
 */
function QueuePanel(props: QueuePanelProps): React.JSX.Element {
	const { queue, command } = props;
	const state = queueStateText(queue);
	return (
		<div className="flex flex-col gap-1">
			<PanelLine tone="muted">
				{state.text}
				{state.recovering ? " — actions resume when the host recovers" : ""}
			</PanelLine>
			<CommandLine command={command} />
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
	);
}

export { QueuePanel, type QueuePanelProps };
