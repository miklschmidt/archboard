import { useCallback, useId, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { MouseEvent } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import { createWorkbenchRuntimeStore } from "../../workbench-runtime/index.js";
import { AccountSection } from "./AccountSection.js";
import { projectThreadLinkPanel } from "./projection.js";
import type {
	ThreadLinkActionSnapshot,
	ThreadLinkController,
	ThreadLinkReadinessTone,
	ThreadLinkRecovery,
	ThreadLinkRecoveryIntent,
	ThreadLinkRow,
	ThreadLinkSelection,
	WorkbenchThreadLinkProps,
} from "./contract.js";

const NO_HOST_RECOVERY: readonly ThreadLinkRecoveryIntent[] = Object.freeze([]);

const TONE_CLASSES = {
	ready: "border-status bg-status-subtle text-status-foreground",
	progress: "border-border bg-surface-subtle text-muted-foreground",
	blocked: "border-warning bg-warning-subtle text-warning",
	failed: "border-destructive bg-destructive-subtle text-destructive",
} as const satisfies Record<ThreadLinkReadinessTone, string>;

const ACTION_CLASSES = {
	idle: "border-border bg-surface-subtle text-muted-foreground",
	pending: "border-border bg-surface-subtle text-muted-foreground",
	succeeded: "border-status bg-status-subtle text-status-foreground",
	inspect_only: "border-warning bg-warning-subtle text-warning",
	failed: "border-destructive bg-destructive-subtle text-destructive",
} as const satisfies Record<ThreadLinkActionSnapshot["state"], string>;

const ROW_ACTION_LABELS = {
	attach: { executable: "Attach", inspect_only: "Attach for inspection" },
	relink: { executable: "Relink", inspect_only: "Relink for inspection" },
	current: { executable: "Linked", inspect_only: "Linked" },
} as const satisfies Record<ThreadLinkRow["intent"], Record<ThreadLinkRow["outcome"], string>>;

const FACT_LABELS = [
	["Classification", "stateLabel"],
	["Source", "sourceLabel"],
	["Status", "statusLabel"],
	["Loaded", "loadedLabel"],
	["Controllability", "controllabilityLabel"],
] as const satisfies readonly (readonly [string, keyof ThreadLinkRow])[];

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
				className="inline-flex min-h-touch-target items-center !text-control font-medium text-foreground underline decoration-primary"
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
		<ul className="m-0 p-0 flex list-none flex-wrap gap-control pb-control">
			{recoveries.map((recovery) => (
				<li className="min-w-0" key={recovery.intent}>
					<RecoveryControl
						accountSectionId={accountSectionId}
						controller={controller}
						pendingLoginId={pendingLoginId}
						recovery={recovery}
						tone="secondary"
					/>
					<span className="mt-compact block text-body text-muted-foreground">
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
		<ul className="m-0 p-0 list-none">
			{rows.map((row) => (
				<li
					className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] items-start gap-control-inline border-t border-border-subtle py-control first:border-t-0"
					data-thread-link-intent={row.intent}
					data-thread-link-outcome={row.outcome}
					data-thread-link-row={row.selectionId}
					key={row.selectionId}
				>
					<div className="min-w-0">
						<p className="m-0 font-mono text-technical text-foreground">{row.threadId}</p>
						<dl className="m-0 grid grid-cols-5 gap-control pt-compact">
							{FACT_LABELS.map(([label, key]) => (
								<div className="min-w-0" key={label}>
									<dt className="text-kicker font-semibold text-muted-foreground">{label}</dt>
									<dd className="m-0 text-body break-words text-foreground">{String(row[key])}</dd>
								</div>
							))}
						</dl>
						<p className="m-0 pt-compact text-body text-muted-foreground">{row.reasonLabel}</p>
					</div>
					<div className="min-w-0">
						<Button
							aria-label={`${ROW_ACTION_LABELS[row.intent][row.outcome]} thread ${row.threadId}`}
							data-thread-link-bind={row.selectionId}
							disabled={!row.enabled}
							onClick={onBind}
							tone={row.outcome === "executable" ? "primary" : "secondary"}
							type="button"
						>
							{ROW_ACTION_LABELS[row.intent][row.outcome]}
						</Button>
						{row.blockedReason === null ? null : (
							<span className="mt-compact block text-body text-muted-foreground">
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
	const pendingLoginId = panel.account.pendingLoginId;
	const create = useCallback(() => {
		void controller.create();
	}, [controller]);
	const announcement =
		panel.action.state === "idle"
			? "No thread-link action has run in this pane."
			: panel.action.announcement;
	const actionRecovery =
		panel.action.state === "idle" || panel.action.state === "pending"
			? null
			: panel.action.recovery;
	return (
		<section
			aria-describedby={readinessId}
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-y border-border bg-surface px-region py-control font-sans text-foreground shadow-flat",
				className,
			)}
			data-thread-link-pane={panel.paneId}
			data-thread-link-readiness={panel.readiness.arm}
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Pane thread link</p>
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						{panel.currentLink.label}
					</h2>
				</div>
				<output
					aria-atomic="true"
					aria-label={`Codex workbench readiness: ${panel.readiness.label}`}
					aria-live="polite"
					className={cn(
						"shrink-0 rounded-control border px-control py-compact !text-body font-medium",
						TONE_CLASSES[panel.readiness.tone],
					)}
				>
					{panel.readiness.label}
				</output>
			</header>
			<p className="m-0 py-control text-body text-muted-foreground" id={readinessId}>
				{panel.currentLink.detail}
			</p>
			<p className="m-0 border-t border-border-subtle py-control text-body text-muted-foreground">
				{panel.readiness.detail}
				{panel.readiness.retryAtMs === null ? null : (
					<span className="ml-compact font-mono text-technical">
						Next start at {panel.readiness.retryAtMs}.
					</span>
				)}
			</p>
			<RecoveryList
				accountSectionId={accountSectionId}
				controller={controller}
				pendingLoginId={pendingLoginId}
				recoveries={panel.readiness.recoveries}
			/>
			<output
				aria-atomic="true"
				aria-label="Codex thread-link action"
				aria-live="polite"
				className={cn(
					"block rounded-control border px-control py-compact !text-body",
					ACTION_CLASSES[panel.action.state],
				)}
				data-thread-link-action={panel.action.state}
			>
				{announcement}
				{actionRecovery === null ? null : (
					<span className="mt-compact block">
						{actionRecovery.label}: {actionRecovery.description}
					</span>
				)}
			</output>
			<section className="border-t border-border py-control" data-thread-link-create="offer">
				<div className="flex items-baseline justify-between gap-control">
					<h3 className="m-0 text-kicker font-semibold text-muted-foreground">
						Create a workhorse thread
					</h3>
					<span className="text-body text-muted-foreground">{panel.create.prerequisite}</span>
				</div>
				<div className="flex items-center gap-control pt-control">
					<Button disabled={!panel.create.enabled} onClick={create} tone="primary" type="button">
						{panel.create.label}
					</Button>
					{panel.create.blockedReason === null ? null : (
						<span className="text-body text-muted-foreground">{panel.create.blockedReason}</span>
					)}
				</div>
			</section>
			<section
				aria-describedby={selectionId}
				aria-labelledby={`${selectionId}-heading`}
				className="border-t border-border py-control"
				data-thread-link-selection={panel.selection.state}
			>
				<div className="flex items-baseline justify-between gap-control">
					<h3
						className="m-0 text-kicker font-semibold text-muted-foreground"
						id={`${selectionId}-heading`}
					>
						Attach a listed thread
					</h3>
					<span className="text-body text-muted-foreground">
						Attach and relink are separate commands from create.
					</span>
				</div>
				<p className="m-0 py-control text-body text-muted-foreground" id={selectionId}>
					{panel.selection.summary}
				</p>
				<SelectionRows controller={controller} rows={rows} />
				<div className="pt-control">
					<RecoveryControl
						accountSectionId={accountSectionId}
						controller={controller}
						pendingLoginId={pendingLoginId}
						recovery={panel.selection.recovery}
						tone="quiet"
					/>
					<span className="mt-compact block text-body text-muted-foreground">
						{panel.selection.recovery.description}
					</span>
				</div>
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
