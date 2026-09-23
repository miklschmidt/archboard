// A decision the agent is waiting on, at the foot of the conversation where
// the person is reading: what it asks in plain words, the evidence (the command
// and its reason, the questions, the effect), and the decisions the model
// allows. Once decided it shrinks to one line.

import { useCallback, type JSX } from "react";

import type { BrowserApproval, BrowserDynamicApproval } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import {
	projectApproval,
	projectDynamicApproval,
	type ApprovalCard as Card,
	type ApprovalDecisionOption,
} from "@/ui/workbench/approval-projection";
import type { AgentActions, ApprovalChoice } from "@/ui/workbench/contracts";

/** Inputs for a card. */
interface ApprovalCardProps {
	readonly approval: BrowserApproval | BrowserDynamicApproval;
	readonly busy: boolean;
	readonly error: string | null;
	/** Voice is live and may answer this one aloud. */
	readonly spoken: boolean;
	readonly actions: AgentActions;
}

/**
 * The card an approval is drawn as.
 * @param approval The approval.
 * @param busy Whether its decision is on the wire.
 * @returns The projected card.
 */
function cardOf(approval: BrowserApproval | BrowserDynamicApproval, busy: boolean): Card {
	return approval.kind === "dynamic_approval"
		? projectDynamicApproval(approval, busy)
		: projectApproval(approval, busy);
}

/**
 * A decision the agent is waiting on.
 * @param props The approval, whether its decision is on the wire, and the actions.
 * @returns The card.
 */
function ApprovalCard(props: ApprovalCardProps): JSX.Element {
	const { approval, busy, actions } = props;
	const card = cardOf(approval, busy);
	const choose = useCallback(
		(choice: ApprovalChoice): void => {
			if (approval.kind === "dynamic_approval") {
				actions.respondToDynamicApproval(
					approval,
					choice.kind === "approve" ? "approve" : "decline",
				);
			} else {
				actions.respondToApproval(approval, choice);
			}
		},
		[approval, actions],
	);
	return (
		<article
			data-slot="approval"
			aria-busy={busy}
			className="border-primary/70 bg-background flex flex-col gap-2 rounded-[4px] border px-3 py-2.5"
		>
			<header className="flex items-baseline justify-between gap-3">
				<h3 className="text-control font-semibold">{card.title}</h3>
				<span className="text-technical text-muted-foreground shrink-0 font-mono">
					{card.phaseText}
				</span>
			</header>
			<Details card={card} />
			{props.error !== null && <p className="text-body text-destructive">{props.error}</p>}
			{card.decisions.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{card.decisions.map((option) => (
						<Decision key={option.id} option={option} disabled={busy} onChoose={choose} />
					))}
				</div>
			)}
			{props.spoken && approval.kind === "approval" && approval.spoken.eligible && (
				<p className="text-body text-muted-foreground">
					You can answer aloud; the voice agent decides what it heard.
				</p>
			)}
		</article>
	);
}

/**
 * What the approval shows as evidence.
 * @param props The card.
 * @param props.card The projected card.
 * @returns The details.
 */
function Details(props: { readonly card: Card }): JSX.Element | null {
	if (props.card.details.length === 0) return null;
	return (
		<dl className="flex flex-col gap-1">
			{props.card.details.map((detail) => (
				<div key={`${detail.label}:${detail.value}`} className="flex flex-col">
					<dt className="text-body text-muted-foreground">{detail.label}</dt>
					<dd
						className={
							detail.mono
								? "bg-muted/70 text-technical rounded-[3px] px-2 py-1 font-mono break-all whitespace-pre-wrap"
								: "text-body wrap-break-word"
						}
					>
						{detail.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * One decision the model allows.
 * @param props The option, whether it is disabled, and the choose handler.
 * @param props.option The decision.
 * @param props.disabled Whether a decision is already on the wire.
 * @param props.onChoose Choose it.
 * @returns The button.
 */
function Decision(props: {
	readonly option: ApprovalDecisionOption;
	readonly disabled: boolean;
	readonly onChoose: (choice: ApprovalChoice) => void;
}): JSX.Element {
	const { option, onChoose } = props;
	const handleClick = useCallback(() => onChoose(option.choice), [onChoose, option.choice]);
	return (
		<Button
			variant={option.tone === "destructive" ? "outline" : option.tone}
			size="sm"
			disabled={props.disabled}
			onClick={handleClick}
			className="h-7 rounded-[3px] px-3"
		>
			{option.label}
		</Button>
	);
}

export { ApprovalCard, type ApprovalCardProps };
