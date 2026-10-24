// A decision the agent is waiting on, at the foot of the conversation where
// the person is reading: what it asks in plain words, the evidence (the command
// and its reason, the questions, the effect), and the decisions the model
// allows. Once decided it shrinks to one line.

import { useCallback, type JSX } from "react";

import type { BrowserApproval, BrowserDynamicApproval } from "@archboard/agent-workbench/contract";

import { Button } from "@archboard/ui-kit/controls";
import {
	projectApproval,
	projectDynamicApproval,
	type ApprovalCard as Card,
	type ApprovalDecisionOption,
} from "#ui/rules/dock/approval-projection.ts";
import type { AgentActions, ApprovalChoice } from "#ui/state/surfaces/contracts.ts";

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
	const eligible = approval.kind === "approval" && approval.spoken.eligible;
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
			data-phase={card.phase}
			aria-busy={busy}
			className={`bg-background rounded-panel flex flex-col gap-2 border px-3 py-2.5 ${PHASE_BORDERS[card.phase]}`}
		>
			<header className="flex items-baseline justify-between gap-3">
				<h3 className="text-control shrink-0 font-semibold">{card.title}</h3>
				<span className="text-technical text-muted-foreground min-w-0 text-right font-mono wrap-break-word">
					{card.phaseText}
				</span>
			</header>
			<Details card={card} />
			{props.error !== null && (
				<p role="alert" className="text-body text-destructive">
					{props.error}
				</p>
			)}
			{card.decisions.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{card.decisions.map((option) => (
						<Decision key={option.id} option={option} disabled={busy} onChoose={choose} />
					))}
				</div>
			)}
			{props.spoken && <SpokenNote eligible={eligible} spokenText={card.spokenText} />}
		</article>
	);
}

/** The card's edge per phase: cobalt while a decision is wanted, destructive once its effect is in doubt. */
const PHASE_BORDERS: Readonly<Record<Card["phase"], string>> = {
	pending: "border-primary/70",
	busy: "border-primary/70",
	settled: "border-destructive/70",
	outcome_unknown: "border-destructive/70",
	closed: "border-border",
};

/**
 * Whether voice may answer this approval, while voice is live: the voice
 * agent decides what it heard (ADR 0019), or why it cannot answer.
 * @param props Whether voice may answer, and the card's words for why not.
 * @param props.eligible Whether the spoken gate may resolve it.
 * @param props.spokenText Why it can or cannot be answered by voice.
 * @returns The line.
 */
function SpokenNote(props: {
	readonly eligible: boolean;
	readonly spokenText: string;
}): JSX.Element {
	return (
		<p className="text-body text-muted-foreground">
			{props.eligible
				? "You can answer aloud; the voice agent decides what it heard."
				: props.spokenText}
		</p>
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
								? "bg-muted/70 text-technical rounded-control px-2 py-1 font-mono break-all whitespace-pre-wrap"
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
			className="rounded-control h-7 px-3"
		>
			{option.label}
		</Button>
	);
}

export { ApprovalCard, type ApprovalCardProps };
