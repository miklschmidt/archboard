import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type DragEvent,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import type { BrowserWorkbenchCommandIntent } from "../../workbench-transport/index.js";

import { createWorkbenchQueueActions } from "./actions.js";
import type {
	WorkbenchQueueEntry,
	WorkbenchQueuePending,
	WorkbenchQueueProps,
	WorkbenchQueueReorderDirection,
	WorkbenchQueueReorderMove,
	WorkbenchQueueSettlement,
	WorkbenchQueueSubmissionId,
} from "./contract.js";
import { projectWorkbenchQueue } from "./projection.js";
import { moveButtonKey, QueueEntryRow } from "./QueueEntryRow.js";
import {
	QUEUE_STATE_CLASSES,
	QueueAddPanel,
	QueueCorrelation,
	QueueCrossLinks,
	QueueSettlementOutput,
} from "./QueueRegionPanels.js";
import { planQueueReorder } from "./reorder.js";
import { createWorkbenchQueueStore } from "./store.js";

const NO_ENTRIES: readonly WorkbenchQueueEntry[] = Object.freeze([]);

/**
 * The linked workhorse queue.
 *
 * Archboard owns every rendered part of this region: it is not an assistant-ui
 * Element and it never instantiates a runtime, a socket, or a Codex owner. It
 * reads one authoritative snapshot through the transport it is handed and emits
 * only the five queue commands the gateway publishes, each against the target
 * captured for the queue it drew — so a link change refuses a command instead of
 * retargeting it. Nothing here commits an optimistic terminal or reordered
 * state: the entries and their order come from the host's snapshot alone.
 */
export function WorkbenchQueue({
	transport,
	crossLinks,
	className,
}: WorkbenchQueueProps): ReactNode {
	const headingId = useId();
	const detailId = useId();
	const store = useMemo(() => createWorkbenchQueueStore(transport), [transport]);
	const observation = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const actions = useMemo(() => createWorkbenchQueueActions(transport), [transport]);

	const [pending, setPending] = useState<WorkbenchQueuePending | null>(null);
	const [settlement, setSettlement] = useState<WorkbenchQueueSettlement | null>(null);
	const [dragging, setDragging] = useState<WorkbenchQueueSubmissionId | null>(null);
	const [addResetKey, setAddResetKey] = useState(0);
	const moveButtons = useRef(new Map<string, HTMLButtonElement>());
	const focusRequest = useRef<string | null>(null);

	const capture = observation.target;
	const view = projectWorkbenchQueue({
		state: observation.state,
		capabilities: observation.capabilities,
		presentedChild: observation.presentedChild,
		targetBlock: capture.captured ? null : capture.reason,
		pending,
		settlement,
	});

	// Focus follows the moved submission once the host has republished the queue,
	// so the person keeps the row they were moving rather than the position.
	useEffect(() => {
		const key = focusRequest.current;
		if (key === null || settlement === null) return;
		focusRequest.current = null;
		moveButtons.current.get(key)?.focus();
	}, [settlement]);

	const registerMoveButton = useCallback((key: string, node: HTMLButtonElement | null) => {
		if (node === null) moveButtons.current.delete(key);
		else moveButtons.current.set(key, node);
	}, []);

	const run = useCallback(
		async (
			control: WorkbenchQueuePending["control"],
			submissionId: WorkbenchQueueSubmissionId | null,
			send: (target: BrowserWorkbenchCommandIntent) => Promise<WorkbenchQueueSettlement>,
		): Promise<WorkbenchQueueSettlement | null> => {
			if (!capture.captured) return null;
			setPending({ control, submissionId });
			const result = await send(capture.target);
			setPending(null);
			setSettlement(result);
			return result;
		},
		[capture],
	);

	const handleRefresh = useCallback(() => {
		const refresh = async (): Promise<void> => {
			setPending({ control: "list", submissionId: null });
			const result = await actions.list();
			setPending(null);
			setSettlement(result);
			// Refreshing is how a person accepts a replaced child: the authoritative
			// queue that just arrived is the queue this region now presents.
			if (result.state === "reconciled") store.acceptCurrentChild();
		};
		void refresh();
	}, [actions, store]);

	const handleAdd = useCallback(
		(prompt: string) => {
			const add = async (): Promise<void> => {
				const result = await run("add", null, (target) => actions.add(prompt, target));
				if (result?.state === "reconciled") setAddResetKey((key) => key + 1);
			};
			void add();
		},
		[actions, run],
	);

	const handleEdit = useCallback(
		(submissionId: WorkbenchQueueSubmissionId, prompt: string) => {
			void run("edit", submissionId, (target) => actions.edit(submissionId, prompt, target));
		},
		[actions, run],
	);

	const handleCancel = useCallback(
		(submissionId: WorkbenchQueueSubmissionId) => {
			void run("cancel", submissionId, (target) => actions.cancel(submissionId, target));
		},
		[actions, run],
	);

	const handleStart = useCallback(
		(submissionId: WorkbenchQueueSubmissionId) => {
			void run("start", submissionId, (target) => actions.start(submissionId, target));
		},
		[actions, run],
	);

	const submitReorder = useCallback(
		(
			submissionId: WorkbenchQueueSubmissionId,
			move: WorkbenchQueueReorderMove,
			focus: string | null,
		) => {
			const entries = observation.state.snapshot?.queue.entries ?? NO_ENTRIES;
			const plan = planQueueReorder(entries, submissionId, move);
			if (!plan.moved) {
				setSettlement({
					control: "reorder",
					state: "refused",
					code: null,
					message: plan.reason,
					submissionId,
				});
				return;
			}
			focusRequest.current = focus;
			void run("reorder", submissionId, (target) =>
				actions.reorder(plan.orderedSubmissionIds, target, submissionId),
			);
		},
		[actions, observation, run],
	);

	const handleMove = useCallback(
		(submissionId: WorkbenchQueueSubmissionId, direction: WorkbenchQueueReorderDirection) => {
			submitReorder(
				submissionId,
				{ kind: "step", direction },
				moveButtonKey(submissionId, direction),
			);
		},
		[submitReorder],
	);

	const handleDragStart = useCallback((submissionId: WorkbenchQueueSubmissionId) => {
		setDragging(submissionId);
	}, []);
	const handleDragEnd = useCallback(() => setDragging(null), []);
	const handleDropAt = useCallback(
		(position: number) => {
			const carried = dragging;
			setDragging(null);
			if (carried === null) return;
			submitReorder(carried, { kind: "drop", position }, moveButtonKey(carried, "earlier"));
		},
		[dragging, submitReorder],
	);
	const handleDragOverEnd = useCallback((event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
	}, []);
	const handleDropEnd = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			// One past the last row: the only drop position that means "the end".
			handleDropAt(view.entries.length + 1);
		},
		[handleDropAt, view.entries.length],
	);

	if (view.state === "unavailable" && view.entries.length === 0)
		return (
			<section
				aria-label="Queue recovery"
				className={cn("shrink-0 px-region font-sans text-body", className)}
				data-queue-state={view.state}
				data-workbench-queue=""
			>
				<Button
					data-queue-control="list"
					disabled={!view.list.enabled || pending !== null}
					onClick={handleRefresh}
					title={view.list.reason ?? "Queued requests could not be loaded."}
					tone="quiet"
				>
					{pending === null ? "Retry queue" : "Loading queue…"}
				</Button>
				{settlement !== null && settlement.state !== "reconciled" ? (
					<QueueSettlementOutput pending={pending} settlement={settlement} />
				) : null}
			</section>
		);

	return (
		<section
			aria-describedby={detailId}
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-y border-border bg-surface px-region py-control font-sans text-foreground shadow-flat",
				className,
			)}
			data-queue-state={view.state}
			data-workbench-queue=""
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Linked workhorse</p>
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						Workhorse queue
					</h2>
				</div>
				<div className="flex shrink-0 items-center gap-control">
					<output
						aria-atomic="true"
						aria-label={`Queue status: ${view.label}`}
						aria-live="polite"
						className={cn(
							"rounded-control border px-control py-compact text-body font-medium",
							QUEUE_STATE_CLASSES[view.state],
						)}
						data-queue-status-label=""
					>
						{view.label}
					</output>
					<Button
						data-queue-control="list"
						disabled={!view.list.enabled}
						focusableWhenDisabled
						onClick={handleRefresh}
						title={view.list.reason ?? undefined}
						tone="secondary"
					>
						Refresh list
					</Button>
				</div>
			</header>
			<p className="m-0 py-control text-body text-muted-foreground" id={detailId}>
				{view.detail} {view.recovery}
			</p>
			<p className="m-0 pb-control text-body text-muted-foreground" data-queue-summary="">
				{view.correlation.summary}
			</p>
			<QueueCorrelation view={view} />
			<QueueCrossLinks crossLinks={crossLinks} />
			<QueueAddPanel onAdd={handleAdd} resetKey={addResetKey} view={view} />
			{view.entries.length === 0 ? (
				<p
					className="m-0 border-t border-border-subtle py-control text-body text-muted-foreground"
					data-queue-empty=""
				>
					No submission is queued on the linked workhorse.
				</p>
			) : (
				<ol
					aria-label="Queued submissions, in the order the host is holding them"
					className="m-0 list-none border-t border-border-subtle p-0"
					data-queue-list=""
				>
					{view.entries.map((entry) => (
						<QueueEntryRow
							crossLinks={crossLinks}
							dragging={dragging === entry.submissionId}
							key={entry.submissionId}
							onCancel={handleCancel}
							onDragEnd={handleDragEnd}
							onDragStart={handleDragStart}
							onDropAt={handleDropAt}
							onEdit={handleEdit}
							onMove={handleMove}
							onStart={handleStart}
							registerMoveButton={registerMoveButton}
							view={entry}
						/>
					))}
				</ol>
			)}
			{view.entries.length === 0 ? null : (
				// The rows drop *before* the row they land on, so without this the last
				// place in the queue is unreachable by pointer: a person would have to
				// drag twice to get there.
				<div
					className="border-t border-border-subtle py-control text-body text-muted-foreground"
					data-queue-drop-end=""
					onDragOver={handleDragOverEnd}
					onDrop={handleDropEnd}
				>
					Drop a submission here to move it to the end of the queue.
				</div>
			)}
			<QueueSettlementOutput pending={view.pending} settlement={view.settlement} />
		</section>
	);
}
