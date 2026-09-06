// Approvals: one card per approval and per dynamic coordination approval,
// with the decisions the model defines, busy state, unknown-outcome and
// resolver-lost states shown plainly, and the spoken approval line on top.

import { cn } from "cn";
import { useCallback } from "react";

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import {
	projectApproval,
	projectDynamicApproval,
	spokenApprovalLine,
} from "@/ui/workbench/approval-projection";
import type { ApprovalCard, ApprovalDecisionOption } from "@/ui/workbench/approval-projection";
import type { ApprovalChoice, WorkbenchActions } from "@/ui/workbench/contracts";
import { PanelLine } from "@/ui/workbench/lib/panel-line";

/** Inputs for the panel. */
interface ApprovalsPanelProps {
	snapshot: BrowserSnapshot;
	busyApprovals: readonly string[];
	/** Error text per approval key, from the approvals controller. */
	errors: Readonly<Record<string, string>>;
	actions: WorkbenchActions;
}

/** Inputs for one decision button. */
interface DecisionButtonProps {
	option: ApprovalDecisionOption;
	onChoose: (choice: ApprovalChoice) => void;
}

/**
 * One decision button, 28px.
 * @param props The option and the callback.
 * @returns The button.
 */
function DecisionButton(props: DecisionButtonProps): React.JSX.Element {
	const { option, onChoose } = props;
	const handleClick = useCallback(() => onChoose(option.choice), [onChoose, option.choice]);
	return (
		<Button variant={option.tone} size="sm" className="rounded-sm" onClick={handleClick}>
			{option.label}
		</Button>
	);
}

/** Inputs for one card. */
interface CardProps {
	card: ApprovalCard;
	/** The controller's error for this card, or null. */
	error: string | null;
	onChoose: (choice: ApprovalChoice) => void;
}

/**
 * The dot per phase: lime while a decision is wanted or on the wire, grey once
 * the card is history, destructive when the outcome is unknown.
 */
const PHASE_DOT: Record<ApprovalCard["phase"], string> = {
	pending: "before:bg-status",
	busy: "before:bg-status motion-safe:before:animate-pulse",
	settled: "before:bg-muted-foreground/60",
	outcome_unknown: "before:bg-destructive",
	closed: "before:bg-muted-foreground/60",
};

/**
 * One approval card: family, details in mono, decisions, and phase.
 * @param props The card and the decision callback.
 * @returns An article.
 */
function Card(props: CardProps): React.JSX.Element {
	const { card } = props;
	const open = card.phase === "pending" || card.phase === "busy";
	return (
		<article
			aria-busy={card.phase === "busy"}
			className={cn(
				"border-border bg-background flex flex-col gap-1.5 rounded-sm border p-2",
				!open && "text-muted-foreground",
			)}
		>
			<header className="flex min-w-0 items-center gap-2">
				{/* The phase dot is a pseudo-element so the family stays the header's first span. */}
				<span
					className={`text-kicker text-muted-foreground flex shrink-0 items-center gap-1.5 uppercase before:size-1.5 before:shrink-0 before:rounded-full ${PHASE_DOT[card.phase]}`}
				>
					{card.family}
				</span>
				<span className={`text-control truncate ${open ? "text-foreground" : ""}`}>
					{card.title}
				</span>
				<span className="text-technical text-muted-foreground ms-auto shrink-0 truncate font-mono">
					{card.phaseText}
				</span>
			</header>
			<dl className="flex flex-col gap-0.5">
				{card.details.map((detail) => (
					<div key={`${detail.label}:${detail.value}`} className="flex items-baseline gap-2">
						<dt className="text-body text-muted-foreground w-16 shrink-0">{detail.label}</dt>
						<dd
							className={
								detail.mono
									? "text-technical min-w-0 font-mono break-all"
									: "text-body min-w-0 break-words"
							}
						>
							{detail.value}
						</dd>
					</div>
				))}
			</dl>
			{card.decisions.length === 0 ? null : (
				<div className="flex flex-wrap items-center gap-1 pt-0.5">
					{card.decisions.map((option) => (
						<DecisionButton key={option.id} option={option} onChoose={props.onChoose} />
					))}
				</div>
			)}
			{props.error === null ? null : (
				<p role="alert" className="text-body text-destructive">
					{props.error}
				</p>
			)}
			<p className="text-body text-muted-foreground">{card.spokenText}</p>
		</article>
	);
}

/** Inputs for one approval item. */
interface ApprovalItemProps {
	approval: BrowserApproval;
	busy: boolean;
	error: string | null;
	respond: WorkbenchActions["respondToApproval"];
}

/**
 * One approval from the app-server session.
 * @param props The approval, its busy state, and the callback.
 * @returns The card.
 */
function ApprovalItem(props: ApprovalItemProps): React.JSX.Element {
	const { approval, respond } = props;
	const handleChoose = useCallback(
		(choice: ApprovalChoice) => respond(approval, choice),
		[approval, respond],
	);
	return (
		<Card
			card={projectApproval(approval, props.busy)}
			error={props.error}
			onChoose={handleChoose}
		/>
	);
}

/** Inputs for one dynamic approval item. */
interface DynamicApprovalItemProps {
	approval: BrowserDynamicApproval;
	busy: boolean;
	error: string | null;
	respond: WorkbenchActions["respondToDynamicApproval"];
}

/**
 * One coordination approval raised through a dynamic tool.
 * @param props The approval, its busy state, and the callback.
 * @returns The card.
 */
function DynamicApprovalItem(props: DynamicApprovalItemProps): React.JSX.Element {
	const { approval, respond } = props;
	const handleChoose = useCallback(
		(choice: ApprovalChoice) =>
			respond(approval, choice.kind === "approve" ? "approve" : "decline"),
		[approval, respond],
	);
	return (
		<Card
			card={projectDynamicApproval(approval, props.busy)}
			error={props.error}
			onChoose={handleChoose}
		/>
	);
}

/**
 * The approvals panel.
 * @param props The snapshot, the busy keys, and the actions.
 * @returns The spoken line and the cards, or an empty state.
 */
function ApprovalsPanel(props: ApprovalsPanelProps): React.JSX.Element {
	const { snapshot, actions } = props;
	const busy = new Set(props.busyApprovals);
	const spoken = spokenApprovalLine(snapshot.spokenApproval);
	const empty = snapshot.approvals.length === 0 && snapshot.dynamicApprovals.length === 0;
	return (
		<div className="flex flex-col gap-2">
			{spoken === null ? null : (
				<PanelLine tone={spoken.warning ? "failure" : "live"}>{spoken.text}</PanelLine>
			)}
			{empty ? <PanelLine tone="muted">Nothing awaiting approval</PanelLine> : null}
			{snapshot.approvals.map((approval) => (
				<ApprovalItem
					key={approval.requestId}
					approval={approval}
					busy={busy.has(approval.requestId)}
					error={props.errors[approval.requestId] ?? null}
					respond={actions.respondToApproval}
				/>
			))}
			{snapshot.dynamicApprovals.map((approval) => (
				<DynamicApprovalItem
					key={approval.identity.callId}
					approval={approval}
					busy={busy.has(approval.identity.callId)}
					error={props.errors[approval.identity.callId] ?? null}
					respond={actions.respondToDynamicApproval}
				/>
			))}
		</div>
	);
}

export { ApprovalsPanel, type ApprovalsPanelProps };
