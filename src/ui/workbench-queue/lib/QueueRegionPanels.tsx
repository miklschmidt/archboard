import { useCallback, useId, useRef, type ReactNode } from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";

import type {
	WorkbenchQueueCrossLinks,
	WorkbenchQueueSettlement,
	WorkbenchQueueState,
	WorkbenchQueueView,
} from "./contract.js";

export const QUEUE_STATE_CLASSES = {
	loading: "border-border bg-surface-subtle text-muted-foreground",
	empty: "border-border bg-surface-subtle text-muted-foreground",
	queued: "border-status bg-status-subtle text-status-foreground",
	running: "border-status bg-status-subtle text-status-foreground",
	interrupted_preserved: "border-warning bg-warning-subtle text-warning",
	approval_blocked: "border-warning bg-warning-subtle text-warning",
	failed: "border-destructive bg-destructive-subtle text-destructive",
	restarted: "border-warning bg-warning-subtle text-warning",
	completed: "border-border bg-surface-subtle text-muted-foreground",
	stale: "border-warning bg-warning-subtle text-warning",
	reconnecting: "border-warning bg-warning-subtle text-warning",
	disconnected: "border-destructive bg-destructive-subtle text-destructive",
	session_stopped: "border-destructive bg-destructive-subtle text-destructive",
	session_incompatible: "border-destructive bg-destructive-subtle text-destructive",
	unavailable: "border-destructive bg-destructive-subtle text-destructive",
	outcome_unknown: "border-warning bg-warning-subtle text-warning",
} as const satisfies Record<WorkbenchQueueState, string>;

const SETTLEMENT_CLASSES = {
	reconciled: "text-muted-foreground",
	refused: "text-destructive",
	outcome_unknown: "text-warning",
} as const satisfies Record<WorkbenchQueueSettlement["state"], string>;

function CorrelationField({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}): ReactNode {
	return (
		<div className="min-w-0">
			<dt className="text-kicker font-semibold text-muted-foreground">{label}</dt>
			<dd className="m-0 font-mono text-technical break-words text-foreground">{value}</dd>
		</div>
	);
}

/** The exact queue/workhorse correlation, in every state. */
export function QueueCorrelation({ view }: { readonly view: WorkbenchQueueView }): ReactNode {
	const correlation = view.correlation;
	return (
		<dl
			className="m-0 grid grid-cols-4 gap-region border-t border-border-subtle pt-control"
			data-queue-correlation-panel=""
		>
			<CorrelationField label="Workhorse thread" value={correlation.workhorseThreadId ?? "none"} />
			<CorrelationField
				label="Link"
				value={`${correlation.linkState ?? "none"} / ${correlation.workhorseThreadStatus ?? "none"}`}
			/>
			<CorrelationField
				label="Workhorse turn"
				value={
					correlation.activeTurnId === null
						? "none"
						: `${correlation.activeTurnId} (${correlation.activeTurnStatus ?? "unknown"})`
				}
			/>
			<CorrelationField
				label="Coordinator thread"
				value={correlation.coordinatorThreadId ?? "none"}
			/>
			<CorrelationField
				label="Child"
				value={
					correlation.child === null
						? "none"
						: `${correlation.child.childId} @ ${correlation.child.epoch}`
				}
			/>
			<CorrelationField label="Snapshot sequence" value={String(correlation.sequence ?? "none")} />
			<CorrelationField
				label="Coordinator-owned"
				value={`${view.coordinatorOwnedCount} of ${view.entries.length}`}
			/>
			<CorrelationField label="Pending approvals" value={String(correlation.blockingApprovals)} />
		</dl>
	);
}

export function QueueCrossLinks({
	crossLinks,
}: {
	readonly crossLinks: WorkbenchQueueCrossLinks;
}): ReactNode {
	return (
		<nav aria-label="Related workbench regions" className="flex gap-control-inline py-control">
			<a
				className="text-body underline decoration-border underline-offset-2 hover:text-foreground"
				data-queue-cross-link="workhorse-timeline"
				href={`#${crossLinks.workhorseTimelineId}`}
			>
				Workhorse timeline
			</a>
			<a
				className="text-body underline decoration-border underline-offset-2 hover:text-foreground"
				data-queue-cross-link="coordinator"
				href={`#${crossLinks.coordinatorDisclosureId}`}
			>
				Coordinator
			</a>
			<a
				className="text-body underline decoration-border underline-offset-2 hover:text-foreground"
				data-queue-cross-link="approvals"
				href={`#${crossLinks.approvalsId}`}
			>
				Approvals
			</a>
		</nav>
	);
}

export interface QueueAddPanelProps {
	readonly view: WorkbenchQueueView;
	readonly resetKey: number;
	readonly onAdd: (prompt: string) => void;
}

export function QueueAddPanel({ view, resetKey, onAdd }: QueueAddPanelProps): ReactNode {
	const labelId = useId();
	const reasonId = useId();
	const fieldId = useId();
	const promptRef = useRef<HTMLTextAreaElement | null>(null);
	const handleAdd = useCallback(() => {
		const prompt = promptRef.current?.value ?? "";
		if (prompt.trim().length > 0) onAdd(prompt);
	}, [onAdd]);
	return (
		<section
			aria-label="Add to the queue"
			className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-control border-t border-border-subtle py-control"
			data-queue-add-panel=""
		>
			<div className="min-w-0">
				<label
					className="text-kicker font-semibold text-muted-foreground"
					htmlFor={fieldId}
					id={labelId}
				>
					Add a submission to the linked workhorse queue
				</label>
				<textarea
					aria-describedby={reasonId}
					id={fieldId}
					className="mt-compact block w-full resize-y rounded-control border border-border bg-surface-raised px-control py-compact font-sans text-body text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
					data-queue-add-prompt=""
					key={resetKey}
					readOnly={!view.add.enabled}
					ref={promptRef}
					rows={2}
				/>
			</div>
			<Button
				data-queue-control="add"
				disabled={!view.add.enabled}
				focusableWhenDisabled
				onClick={handleAdd}
				title={view.add.reason ?? undefined}
				tone="primary"
			>
				Add
			</Button>
			<p className="sr-only" id={reasonId}>
				{view.add.reason ?? "Adding is available."}
			</p>
		</section>
	);
}

export function QueueSettlementOutput({
	settlement,
	pending,
}: {
	readonly settlement: WorkbenchQueueSettlement | null;
	readonly pending: WorkbenchQueueView["pending"];
}): ReactNode {
	const message =
		pending === null
			? (settlement?.message ?? "No queue command has been sent from this pane.")
			: `Sending the ${pending.control} command; its outcome is not settled yet.`;
	const state = pending === null ? (settlement?.state ?? "reconciled") : "reconciled";
	const refused = state === "refused";
	// Two regions with fixed politeness rather than one that changes it: a live
	// region that switches between polite and assertive is re-announced by some
	// screen readers and skipped by others.
	return (
		<div className="border-t border-border-subtle pt-control">
			<output
				aria-atomic="true"
				aria-live="polite"
				className={cn("block text-body", SETTLEMENT_CLASSES[state])}
				data-queue-settlement={settlement === null ? "none" : settlement.state}
				data-queue-settlement-code={settlement?.code ?? "none"}
				data-queue-settlement-control={settlement?.control ?? "none"}
			>
				{refused ? "" : message}
			</output>
			<p
				aria-atomic="true"
				aria-live="assertive"
				className={cn("m-0 text-body", SETTLEMENT_CLASSES.refused)}
				data-queue-settlement-alert={refused ? "refused" : "none"}
				role="alert"
			>
				{refused ? message : ""}
			</p>
		</div>
	);
}
