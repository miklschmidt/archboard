import { useSyncExternalStore, type ReactNode } from "react";

import { projectWorkbenchBoardStatus } from "../../workbench-board-status/index.js";
import { projectWorkbenchCoordinator } from "../../workbench-coordinator/index.js";
import { projectWorkbenchQueue } from "../../workbench-queue/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import type { WorkbenchFramePane } from "../contract.js";

const UNAVAILABLE_SEMANTIC_CONTEXT = Object.freeze({ state: "unavailable" as const });

interface CompactFactProps {
	readonly label: string;
	readonly state: string;
	readonly value: string;
	readonly name: string;
}

function CompactFact({ label, state, value, name }: CompactFactProps): ReactNode {
	return (
		<div
			className="min-w-0 flex min-h-touch-target flex-col justify-center border-l border-border-subtle px-panel py-control first:border-l-0"
			data-workbench-compact-item={name}
			data-workbench-compact-state={state}
		>
			<dt className="font-sans text-kicker font-semibold text-muted-foreground">{label}</dt>
			<dd className="m-0 truncate font-sans text-body text-foreground" title={value}>
				{value}
			</dd>
		</div>
	);
}

function readableState(value: string): string {
	const words = value.replaceAll("_", " ").replaceAll("-", " ");
	return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function workhorseStatus(state: BrowserWorkbenchState): Readonly<{ state: string; label: string }> {
	if (
		state.state === "reconnecting" ||
		state.state === "backoff" ||
		state.state === "stale_snapshot"
	) {
		return Object.freeze({ state: state.state, label: readableState(state.state) });
	}
	const value =
		state.kind === "readiness" ? (state.snapshot.threadLink.status ?? state.state) : state.state;
	return Object.freeze({ state: value, label: readableState(value) });
}

function fieldByLabel(
	fields: ReturnType<typeof projectWorkbenchCoordinator>["coordinatorIdentity"]["fields"],
	label: string,
) {
	return fields.find((field) => field.label === label) ?? null;
}

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- A native horizontal overflow region needs a focus target for keyboard scrolling; retaining region semantics is more accurate than inventing an interactive widget role. */
export function WorkbenchFrameCompact({ pane }: { readonly pane: WorkbenchFramePane }): ReactNode {
	const state = useSyncExternalStore(
		pane.transport.subscribe,
		pane.transport.state,
		pane.transport.state,
	);
	const board = projectWorkbenchBoardStatus({
		paneLabel: pane.identity.label,
		connection: pane.boardStatus.connection,
		claim: pane.boardStatus.claim,
		doing: pane.boardStatus.doing,
		takeBack:
			pane.boardStatus.takeBackState ??
			(pane.boardStatus.claim.state === "claimed" ? "available" : "idle"),
		semanticContext: pane.boardStatus.semanticContext ?? UNAVAILABLE_SEMANTIC_CONTEXT,
	});
	const queue = projectWorkbenchQueue({ state, capabilities: pane.transport.capabilities() });
	const coordinator = projectWorkbenchCoordinator(state);
	const workhorse = workhorseStatus(state);
	const claim =
		board.claim.state === "claimed"
			? (board.claim.reason ?? `${readableState(board.claim.holderKind)} ${board.claim.holderId}`)
			: "Board is yours";
	const doing = board.doing.current?.doing ?? "No current board change";
	const coordinatorHistory = fieldByLabel(
		coordinator.coordinatorIdentity.fields,
		"Coordinator history",
	);
	const configuredModel = fieldByLabel(coordinator.coordinatorSettings.fields, "Configured model");
	const configuredEffort = fieldByLabel(
		coordinator.coordinatorSettings.fields,
		"Configured reasoning effort",
	);
	const coordinatorSettings =
		configuredModel?.state === "confirmed" && configuredEffort?.state === "confirmed"
			? `${configuredModel.value} · ${configuredEffort.value}`
			: coordinator.status.label;

	return (
		<section
			aria-label={`${pane.identity.label} compact workbench status`}
			className="min-w-0 overflow-x-auto border-t border-border bg-surface-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
			data-workbench-content="compact"
			data-workbench-region="compact"
			tabIndex={0}
		>
			<dl className="m-0 grid grid-cols-[repeat(6,minmax(10rem,1fr))]">
				<CompactFact
					label="Workhorse"
					name="workhorse"
					state={workhorse.state}
					value={workhorse.label}
				/>
				<CompactFact
					label="Board claim"
					name="board-claim"
					state={board.claim.state}
					value={claim}
				/>
				<CompactFact
					label="Board doing"
					name="board-doing"
					state={board.doing.current === null ? "idle" : "active"}
					value={doing}
				/>
				<CompactFact
					label="Queue"
					name="queue"
					state={queue.state}
					value={`${queue.label} · ${queue.entries.length} ${queue.entries.length === 1 ? "item" : "items"}`}
				/>
				<CompactFact
					label="Coordinator history"
					name="coordinator-history"
					state={coordinatorHistory?.state ?? "unavailable"}
					value={coordinatorHistory?.value ?? "Coordinator history unavailable"}
				/>
				<CompactFact
					label="Coordinator settings"
					name="coordinator-settings"
					state={coordinator.status.state}
					value={coordinatorSettings}
				/>
			</dl>
		</section>
	);
}
/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */
