import {
	useCallback,
	useId,
	useRef,
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";

import type {
	WorkbenchQueueAvailability,
	WorkbenchQueueCrossLinks,
	WorkbenchQueueEntryView,
	WorkbenchQueueReorderDirection,
	WorkbenchQueueSubmissionId,
} from "./contract.js";

const OWNERSHIP_CLASSES = {
	coordinator: "border-primary text-primary",
	foreign: "border-border text-muted-foreground",
} as const satisfies Record<WorkbenchQueueEntryView["ownership"], string>;

export function moveButtonKey(
	submissionId: WorkbenchQueueSubmissionId,
	direction: WorkbenchQueueReorderDirection,
): string {
	return `${submissionId}|${direction}`;
}

export interface QueueEntryRowProps {
	readonly view: WorkbenchQueueEntryView;
	readonly crossLinks: WorkbenchQueueCrossLinks;
	readonly dragging: boolean;
	readonly onEdit: (submissionId: WorkbenchQueueSubmissionId, prompt: string) => void;
	readonly onCancel: (submissionId: WorkbenchQueueSubmissionId) => void;
	readonly onStart: (submissionId: WorkbenchQueueSubmissionId) => void;
	readonly onMove: (
		submissionId: WorkbenchQueueSubmissionId,
		direction: WorkbenchQueueReorderDirection,
	) => void;
	readonly onDragStart: (submissionId: WorkbenchQueueSubmissionId) => void;
	readonly onDragEnd: () => void;
	readonly onDropAt: (position: number) => void;
	readonly registerMoveButton: (key: string, node: HTMLButtonElement | null) => void;
}

function reasonOf(availability: WorkbenchQueueAvailability): string | undefined {
	return availability.reason ?? undefined;
}

export function QueueEntryRow({
	view,
	crossLinks,
	dragging,
	onEdit,
	onCancel,
	onStart,
	onMove,
	onDragStart,
	onDragEnd,
	onDropAt,
	registerMoveButton,
}: QueueEntryRowProps): ReactNode {
	const rowId = useId();
	const reasonsId = useId();
	const promptRef = useRef<HTMLTextAreaElement | null>(null);
	const submissionId = view.submissionId;

	const handleEdit = useCallback(() => {
		onEdit(submissionId, promptRef.current?.value ?? view.prompt);
	}, [onEdit, submissionId, view.prompt]);
	const handleCancel = useCallback(() => onCancel(submissionId), [onCancel, submissionId]);
	const handleStart = useCallback(() => onStart(submissionId), [onStart, submissionId]);
	const handleEarlier = useCallback(() => onMove(submissionId, "earlier"), [onMove, submissionId]);
	const handleLater = useCallback(() => onMove(submissionId, "later"), [onMove, submissionId]);
	const handleMoveKeys = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
			event.preventDefault();
			onMove(submissionId, event.key === "ArrowUp" ? "earlier" : "later");
		},
		[onMove, submissionId],
	);
	const handleDragStart = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.dataTransfer?.setData("text/plain", String(submissionId));
			onDragStart(submissionId);
		},
		[onDragStart, submissionId],
	);
	const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
	}, []);
	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			onDropAt(view.position);
		},
		[onDropAt, view.position],
	);
	const registerEarlier = useCallback(
		(node: HTMLButtonElement | null) =>
			registerMoveButton(moveButtonKey(submissionId, "earlier"), node),
		[registerMoveButton, submissionId],
	);
	const registerLater = useCallback(
		(node: HTMLButtonElement | null) =>
			registerMoveButton(moveButtonKey(submissionId, "later"), node),
		[registerMoveButton, submissionId],
	);

	return (
		<li
			aria-describedby={reasonsId}
			aria-labelledby={rowId}
			className="border-t border-border-subtle first:border-t-0"
			data-queue-entry={submissionId}
			data-queue-entry-status={view.status}
			data-queue-ownership={view.ownership}
			data-queue-position={view.position}
		>
			{/* The drag surface is a plain container: the row keeps its list
			    semantics, and the keyboard path stays on the move buttons. */}
			<div
				className={cn(
					"min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-control py-control",
					dragging && "bg-surface-subtle",
				)}
				data-queue-drag-surface={submissionId}
				draggable
				onDragEnd={onDragEnd}
				onDragOver={handleDragOver}
				onDragStart={handleDragStart}
				onDrop={handleDrop}
			>
				<div className="min-w-0">
					<p className="m-0 flex items-baseline gap-control text-kicker font-semibold text-muted-foreground">
						<span id={rowId}>{view.label}</span>
						<span
							className={cn("rounded-control border px-compact", OWNERSHIP_CLASSES[view.ownership])}
						>
							{view.ownershipLabel}
						</span>
						<span data-queue-entry-status-label="">{view.statusLabel}</span>
					</p>
					<textarea
						aria-label={`Prompt for submission ${view.position} of ${view.total}`}
						className="mt-compact block w-full resize-y rounded-control border border-border bg-surface-raised px-control py-compact font-sans text-body text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
						data-queue-prompt={submissionId}
						defaultValue={view.prompt}
						key={`${submissionId}:${view.prompt}`}
						readOnly={!view.edit.enabled}
						ref={promptRef}
						rows={2}
					/>
					<p className="m-0 mt-compact text-body text-muted-foreground" data-queue-correlation="">
						{view.correlation}
					</p>
					{view.coordinatorOperationId === null ? null : (
						<p className="m-0 font-mono text-technical text-muted-foreground">
							<a
								className="underline decoration-border underline-offset-2 hover:text-foreground"
								data-queue-cross-link="coordinator-operation"
								href={`#${crossLinks.coordinatorDisclosureId}`}
							>
								Coordinator operation {view.coordinatorOperationId}
							</a>
						</p>
					)}
					<p className="m-0 font-mono text-technical text-muted-foreground">
						Submission {submissionId}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-start justify-end gap-control">
					<Button
						aria-label={`Move submission ${view.position} earlier`}
						data-queue-control="reorder"
						data-queue-direction="earlier"
						disabled={!view.moveEarlier.enabled}
						focusableWhenDisabled
						onClick={handleEarlier}
						onKeyDown={handleMoveKeys}
						ref={registerEarlier}
						size="icon"
						title={reasonOf(view.moveEarlier)}
						tone="quiet"
					>
						↑
					</Button>
					<Button
						aria-label={`Move submission ${view.position} later`}
						data-queue-control="reorder"
						data-queue-direction="later"
						disabled={!view.moveLater.enabled}
						focusableWhenDisabled
						onClick={handleLater}
						onKeyDown={handleMoveKeys}
						ref={registerLater}
						size="icon"
						title={reasonOf(view.moveLater)}
						tone="quiet"
					>
						↓
					</Button>
					<Button
						aria-label={`Edit submission ${view.position}`}
						data-queue-control="edit"
						disabled={!view.edit.enabled}
						focusableWhenDisabled
						onClick={handleEdit}
						title={reasonOf(view.edit)}
						tone="secondary"
					>
						Edit
					</Button>
					<Button
						aria-label={`Cancel submission ${view.position}`}
						data-queue-control="cancel"
						disabled={!view.cancel.enabled}
						focusableWhenDisabled
						onClick={handleCancel}
						title={reasonOf(view.cancel)}
						tone="secondary"
					>
						Cancel
					</Button>
					<Button
						aria-label={`Start submission ${view.position}`}
						data-queue-control="start"
						disabled={!view.start.enabled}
						focusableWhenDisabled
						onClick={handleStart}
						title={reasonOf(view.start)}
						tone="primary"
					>
						Start
					</Button>
				</div>
			</div>
			<p className="sr-only" data-queue-entry-reasons="" id={reasonsId}>
				{[
					view.moveEarlier.reason,
					view.moveLater.reason,
					view.edit.reason,
					view.cancel.reason,
					view.start.reason,
				]
					.filter((reason) => reason !== null)
					.join(" ")}
			</p>
		</li>
	);
}
