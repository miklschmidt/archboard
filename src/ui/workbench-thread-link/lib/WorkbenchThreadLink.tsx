import { useCallback, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { MouseEvent } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import { createWorkbenchRuntimeStore } from "../../workbench-runtime/index.js";
import { AccountSection } from "./AccountSection.js";
import { projectThreadLinkPanel } from "./projection.js";
import type {
	ThreadLinkActionSnapshot,
	ThreadLinkController,
	ThreadLinkRecovery,
	ThreadLinkRecoveryIntent,
	ThreadLinkRow,
	ThreadLinkSelection,
	WorkbenchThreadLinkProps,
} from "./contract.js";

const NO_HOST_RECOVERY: readonly ThreadLinkRecoveryIntent[] = Object.freeze([]);

const ACTION_CLASSES = {
	idle: "border-border bg-surface-subtle text-muted-foreground",
	pending: "border-border bg-surface-subtle text-muted-foreground",
	succeeded: "border-status bg-status-subtle text-status-foreground",
	inspect_only: "border-warning bg-warning-subtle text-warning",
	failed: "border-destructive bg-destructive-subtle text-destructive",
} as const satisfies Record<ThreadLinkActionSnapshot["state"], string>;

const ROW_ACTION_LABELS = {
	attach: { executable: "Connect", inspect_only: "View only" },
	relink: { executable: "Switch", inspect_only: "View only" },
	current: { executable: "Connected", inspect_only: "Viewing" },
} as const satisfies Record<ThreadLinkRow["intent"], Record<ThreadLinkRow["outcome"], string>>;

interface RecoveryControlProps {
	readonly recovery: ThreadLinkRecovery;
	readonly controller: ThreadLinkController;
	readonly pendingLoginId: PendingLoginId;
	readonly accountSectionId: string;
	readonly tone: "secondary" | "quiet";
}

function RecoveryControl({
	recovery,
	controller,
	pendingLoginId,
	accountSectionId,
	tone,
}: RecoveryControlProps): ReactNode {
	const run = useCallback(() => {
		runRecoveryIntent(recovery.intent, controller, pendingLoginId);
	}, [controller, pendingLoginId, recovery.intent]);
	if (recovery.intent === "retry_login")
		return (
			<a
				className="inline-flex min-h-touch-target items-center text-sm font-medium text-foreground underline decoration-primary"
				data-thread-link-recovery={recovery.intent}
				href={`#${accountSectionId}`}
			>
				{recovery.label}
			</a>
		);
	return (
		<Button
			data-thread-link-recovery={recovery.intent}
			disabled={!recovery.available}
			onClick={run}
			tone={tone}
			type="button"
		>
			{recovery.label}
		</Button>
	);
}

function RecoveryList({
	recoveries,
	controller,
	pendingLoginId,
	accountSectionId,
}: {
	readonly recoveries: readonly ThreadLinkRecovery[];
	readonly controller: ThreadLinkController;
	readonly pendingLoginId: PendingLoginId;
	readonly accountSectionId: string;
}): ReactNode {
	if (recoveries.length === 0) return null;
	return (
		<ul className="m-0 flex list-none flex-wrap gap-control p-0 pb-control">
			{recoveries.map((recovery) => (
				<li className="min-w-0" key={recovery.intent}>
					<RecoveryControl
						accountSectionId={accountSectionId}
						controller={controller}
						pendingLoginId={pendingLoginId}
						recovery={recovery}
						tone="secondary"
					/>
					<span className="mt-compact block text-sm text-muted-foreground">
						{recovery.description}
					</span>
				</li>
			))}
		</ul>
	);
}

function SelectionRows({
	rows,
	controller,
}: {
	readonly rows: ThreadLinkSelection["rows"];
	readonly controller: ThreadLinkController;
}): ReactNode {
	const onBind = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			const selected = event.currentTarget.dataset.threadLinkBind;
			const row = rows.find((candidate) => candidate.selectionId === selected);
			if (row !== undefined) void controller.bind(row);
		},
		[controller, rows],
	);
	return (
		<ul className="m-0 list-none p-0">
			{rows.map((row) => (
				<li
					className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] items-start gap-control-inline border-t border-border-subtle py-control first:border-t-0"
					data-thread-link-intent={row.intent}
					data-thread-link-outcome={row.outcome}
					data-thread-link-row={row.selectionId}
					key={row.selectionId}
				>
					<div className="min-w-0">
						<p className="m-0 font-mono text-sm text-foreground">{row.threadId}</p>
						<p className="m-0 pt-compact text-sm text-muted-foreground">
							{row.outcome === "inspect_only" ? "Read only" : row.statusLabel}
						</p>
						{row.outcome === "inspect_only" ? (
							<p className="m-0 pt-compact text-sm text-muted-foreground">{row.reasonLabel}</p>
						) : null}
					</div>
					<div className="min-w-0">
						<Button
							aria-label={`${ROW_ACTION_LABELS[row.intent][row.outcome]} conversation ${row.threadId}`}
							data-thread-link-bind={row.selectionId}
							disabled={!row.enabled}
							onClick={onBind}
							tone={row.outcome === "executable" ? "primary" : "secondary"}
							type="button"
						>
							{ROW_ACTION_LABELS[row.intent][row.outcome]}
						</Button>
						{row.blockedReason === null ? null : (
							<span className="mt-compact block text-sm text-muted-foreground">
								{row.blockedReason}
							</span>
						)}
					</div>
				</li>
			))}
		</ul>
	);
}

type PendingLoginId = ReturnType<typeof projectThreadLinkPanel>["account"]["pendingLoginId"];

/** Route one recovery control to the owner that can actually perform it. */
function runRecoveryIntent(
	intent: ThreadLinkRecoveryIntent,
	controller: ThreadLinkController,
	pendingLoginId: PendingLoginId,
): void {
	if (intent === "retry_login") return;
	if (intent === "cancel_login") {
		if (pendingLoginId !== null) void controller.cancelLogin(pendingLoginId);
		return;
	}
	if (intent === "sign_out") {
		void controller.logout();
		return;
	}
	if (intent === "refresh_inventory") {
		void controller.refreshInventory();
		return;
	}
	void controller.recover(intent);
}

export function WorkbenchThreadLink({
	paneId,
	transport,
	controller,
	hostRecoveryIntents = NO_HOST_RECOVERY,
	initialAccountForm,
	className,
}: WorkbenchThreadLinkProps): ReactNode {
	const headingId = useId();
	const readinessId = useId();
	const selectionId = useId();
	const [choosing, setChoosing] = useState(false);
	const accountSectionId = useId();
	const store = useMemo(() => createWorkbenchRuntimeStore(transport), [transport]);
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const action = useSyncExternalStore(
		controller.subscribe,
		controller.snapshot,
		controller.snapshot,
	);
	const panel = projectThreadLinkPanel({
		paneId,
		state,
		capabilities: transport.capabilities(),
		hostRecoveryIntents,
		action,
	});
	const rows = panel.selection.rows;
	const unavailableReason =
		panel.readiness.arm === "thread_capable" ? panel.create.blockedReason : panel.readiness.detail;
	const readinessRecoveries = useMemo(
		() =>
			panel.readiness.recoveries.filter(
				(recovery) => !["retry_login", "cancel_login"].includes(recovery.intent),
			),
		[panel.readiness.recoveries],
	);
	const pendingLoginId = panel.account.pendingLoginId;
	const create = useCallback(() => {
		void controller.create();
	}, [controller]);
	const chooseExisting = useCallback(() => {
		setChoosing((current) => !current);
		if (!choosing && panel.selection.state === "unknown" && panel.selection.recovery.available)
			void controller.refreshInventory();
	}, [choosing, controller, panel.selection.recovery.available, panel.selection.state]);
	const actionRecovery =
		panel.action.state === "idle" || panel.action.state === "pending"
			? null
			: panel.action.recovery;
	return (
		<section
			aria-labelledby={headingId}
			className={cn("min-w-0 px-region py-region font-sans text-foreground", className)}
			data-thread-link-pane={panel.paneId}
			data-thread-link-readiness={panel.readiness.arm}
		>
			<header className="min-w-0 pb-region">
				<h2 className="sr-only" id={headingId}>
					Connection
				</h2>
				<p className="m-0 text-sm text-muted-foreground">{panel.currentLink.detail}</p>
				{panel.currentLink.threadId === null ? null : (
					<details className="pt-control">
						<summary className="flex min-h-touch-target cursor-pointer items-center text-sm text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring">
							Conversation details
						</summary>
						<p className="m-0 pb-control font-mono text-sm break-all">
							{panel.currentLink.threadId}
						</p>
					</details>
				)}
			</header>
			{unavailableReason === null ? null : (
				<output className="m-0 block pb-control text-sm text-muted-foreground" id={readinessId}>
					{unavailableReason}
				</output>
			)}
			<RecoveryList
				accountSectionId={accountSectionId}
				controller={controller}
				pendingLoginId={pendingLoginId}
				recoveries={readinessRecoveries}
			/>
			{panel.action.state === "idle" ? null : (
				<output
					aria-atomic="true"
					aria-label="Agent connection action"
					aria-live="polite"
					className={cn(
						"mb-control block border-l-2 px-control py-control text-sm",
						ACTION_CLASSES[panel.action.state],
					)}
					data-thread-link-action={panel.action.state}
				>
					{panel.action.announcement}
					{actionRecovery === null ? null : (
						<span className="mt-compact block">{actionRecovery.description}</span>
					)}
				</output>
			)}
			<div
				className="flex flex-wrap items-center gap-control pb-region"
				data-thread-link-create="offer"
			>
				<Button
					aria-describedby={panel.create.blockedReason === null ? undefined : readinessId}
					disabled={!panel.create.enabled}
					onClick={create}
					tone="primary"
					type="button"
				>
					{panel.currentLink.threadId === null ? panel.create.label : "Start new conversation"}
				</Button>
				<Button
					aria-controls={selectionId}
					aria-expanded={choosing}
					onClick={chooseExisting}
					tone="secondary"
					type="button"
				>
					Choose existing conversation
				</Button>
			</div>
			<section
				hidden={!choosing}
				aria-label="Existing conversations"
				className="border-t border-border py-region"
				data-thread-link-selection={panel.selection.state}
				id={selectionId}
			>
				<div className="flex min-h-touch-target items-center justify-between gap-control pb-control">
					<h3 className="m-0 text-sm font-semibold">Existing conversations</h3>
					<RecoveryControl
						accountSectionId={accountSectionId}
						controller={controller}
						pendingLoginId={pendingLoginId}
						recovery={panel.selection.recovery}
						tone="quiet"
					/>
				</div>
				<p className="m-0 pb-control text-sm text-muted-foreground">{panel.selection.summary}</p>
				<SelectionRows controller={controller} rows={rows} />
			</section>
			<AccountSection
				account={panel.account}
				controller={controller}
				initialForm={initialAccountForm}
				sectionId={accountSectionId}
			/>
		</section>
	);
}
