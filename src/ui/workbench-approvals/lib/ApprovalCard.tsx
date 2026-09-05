import { useCallback, useId, type ReactNode } from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalDisclosure,
	WorkbenchApprovalField,
	WorkbenchApprovalFieldError,
	WorkbenchApprovalFormEvent,
	WorkbenchApprovalFormState,
	WorkbenchApprovalOffer,
	WorkbenchApprovalPhase,
} from "../contract.js";
import { ApprovalFieldControl } from "./ApprovalFieldControl.js";
import { approvalKicker } from "./projection.js";

const NO_FIELDS: readonly WorkbenchApprovalField[] = Object.freeze([]);

const PHASE_CLASSES = {
	staged: "border-border bg-surface-subtle text-muted-foreground",
	pending: "border-primary bg-primary-subtle text-primary",
	approved: "border-status bg-status-subtle text-status-foreground",
	declined: "border-border bg-surface-subtle text-foreground",
	cancelled: "border-border bg-surface-subtle text-muted-foreground",
	expired: "border-warning bg-warning-subtle text-warning",
	stale: "border-warning bg-warning-subtle text-warning",
	disconnected: "border-destructive bg-destructive-subtle text-destructive",
	delivered: "border-status bg-status-subtle text-status-foreground",
	not_delivered: "border-destructive bg-destructive-subtle text-destructive",
	outcome_unknown: "border-warning bg-warning-subtle text-warning",
} as const satisfies Record<WorkbenchApprovalPhase, string>;

function DisclosureRows({
	label,
	rows,
}: {
	readonly label: string;
	readonly rows: readonly WorkbenchApprovalDisclosure[];
}): ReactNode {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="min-w-0">
			<h4
				className="m-0 border-b border-border pb-compact font-sans text-kicker font-semibold text-muted-foreground"
				id={headingId}
			>
				{label}
			</h4>
			<dl className="m-0">
				{rows.map((entry) => (
					<div
						className="grid min-w-0 grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.2fr)] gap-control border-t border-border-subtle py-compact first:border-t-0"
						data-approval-row={entry.label}
						key={entry.label}
					>
						<dt className="font-sans text-body font-medium text-muted-foreground">{entry.label}</dt>
						<dd
							className={cn(
								"m-0 min-w-0 !text-body break-words text-foreground",
								entry.technical ? "font-mono" : "font-sans",
							)}
						>
							{entry.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function ApprovalOfferButton({
	cardKey,
	offer,
	disabled,
	onDecide,
	onFocusCard,
}: {
	readonly cardKey: string;
	readonly offer: WorkbenchApprovalOffer;
	readonly disabled: boolean;
	readonly onDecide: (cardKey: string, offerId: string) => void;
	readonly onFocusCard: (cardKey: string) => void;
}): ReactNode {
	const offerId = offer.id;
	const handleClick = useCallback(() => {
		onDecide(cardKey, offerId);
	}, [cardKey, offerId, onDecide]);
	const handleFocus = useCallback(() => {
		onFocusCard(cardKey);
	}, [cardKey, onFocusCard]);
	return (
		<Button
			data-approval-offer={offer.id}
			data-approval-spoken-offer={offer.spokenEligible ? "true" : "false"}
			disabled={disabled}
			onClick={handleClick}
			onFocus={handleFocus}
			tone={offer.tone}
			title={offer.description ?? undefined}
		>
			{offer.label}
		</Button>
	);
}

export interface ApprovalCardProps {
	readonly card: WorkbenchApprovalCard;
	readonly form: WorkbenchApprovalFormState;
	readonly errors: readonly WorkbenchApprovalFieldError[];
	readonly result: WorkbenchApprovalDecisionResult | null;
	readonly busy: boolean;
	readonly onFormEvent: (cardKey: string, event: WorkbenchApprovalFormEvent) => void;
	readonly onDecide: (cardKey: string, offerId: string) => void;
	/** Told when focus enters this card so the surface can return it later. */
	readonly onFocusCard: (cardKey: string) => void;
}

function resultMessage(result: WorkbenchApprovalDecisionResult): string {
	return result.status === "invalid"
		? "This request still needs a complete answer."
		: result.message;
}

export function ApprovalCard({
	card,
	form,
	errors,
	result,
	busy,
	onFormEvent,
	onDecide,
	onFocusCard,
}: ApprovalCardProps): ReactNode {
	const headingId = useId();
	const status = card.status;
	const fields = card.kind === "ordinary" ? card.fields : NO_FIELDS;
	const decidable = card.offers.length > 0;
	return (
		<article
			aria-labelledby={headingId}
			className="min-w-0 border-b border-border px-region py-control last:border-b-0"
			data-approval-authority={status.authority}
			data-approval-family={card.kind === "ordinary" ? card.family : card.tool}
			data-approval-key={card.key}
			data-approval-kind={card.kind}
			data-approval-phase={status.phase}
			data-approval-resumable="false"
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control">
				<div className="min-w-0">
					<p className="m-0 font-sans text-kicker font-semibold text-muted-foreground">
						{approvalKicker(card)}
					</p>
					<h3 className="m-0 font-sans text-title font-semibold text-foreground" id={headingId}>
						{card.title}
					</h3>
				</div>
				<output
					aria-atomic="true"
					aria-label={`Approval status: ${status.label}`}
					aria-live="polite"
					className={cn(
						"shrink-0 rounded-control border px-control py-compact font-sans !text-body font-medium",
						PHASE_CLASSES[status.phase],
					)}
				>
					{status.label}
				</output>
			</header>
			<p className="m-0 py-compact font-sans text-body text-foreground">{card.summary}</p>
			<p className="m-0 pb-control font-sans text-body text-muted-foreground">
				{status.detail}
				{status.recovery === null ? null : ` ${status.recovery}`}
			</p>
			<p
				className="m-0 pb-control font-sans text-body text-muted-foreground"
				data-approval-spoken={card.spoken.eligible ? "eligible" : "visual_only"}
			>
				{card.spoken.label}: {card.spoken.detail}
			</p>
			<div className="grid grid-cols-2 gap-region py-control">
				<DisclosureRows label="Request identity" rows={card.identity} />
				<DisclosureRows label="Requested effect" rows={card.effect} />
			</div>
			{card.kind === "ordinary" ? (
				<DisclosureRows label="Approval broker identity" rows={card.broker} />
			) : null}
			{card.kind === "ordinary" && card.links.length > 0 ? (
				<ul className="m-0 list-none p-0 py-control" data-approval-links="safe">
					{card.links.map((link) => (
						<li key={link.href}>
							<a
								className="font-mono text-body text-primary underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
								href={link.href}
								rel="noreferrer noopener"
								target="_blank"
							>
								{link.label}
							</a>
						</li>
					))}
				</ul>
			) : null}
			{card.notices.length === 0 ? null : (
				<ul className="m-0 list-none p-0" data-approval-notices="true">
					{card.notices.map((notice) => (
						<li
							className="border-t border-border-subtle py-compact font-sans text-body text-muted-foreground"
							key={notice}
						>
							{notice}
						</li>
					))}
				</ul>
			)}
			{fields.length === 0 ? null : (
				<fieldset
					className="m-0 min-w-0 border-0 p-0"
					data-approval-fields={decidable && !busy ? "editable" : "read_only"}
					disabled={!decidable || busy}
				>
					{fields.map((field) => (
						<ApprovalFieldControl
							cardKey={card.key}
							error={errors.find((entry) => entry.name === field.name)?.message ?? null}
							field={field}
							form={form}
							key={field.name}
							onChange={onFormEvent}
							onFocusCard={onFocusCard}
						/>
					))}
				</fieldset>
			)}
			{decidable ? (
				<div className="flex flex-wrap gap-control pt-control" data-approval-offers="live">
					{card.offers.map((offer) => (
						<ApprovalOfferButton
							cardKey={card.key}
							disabled={busy}
							key={offer.id}
							offer={offer}
							onDecide={onDecide}
							onFocusCard={onFocusCard}
						/>
					))}
				</div>
			) : (
				<p
					className="m-0 border-t border-border pt-control font-sans text-body text-muted-foreground"
					data-approval-offers="removed"
				>
					{status.authorityReason ?? "This request no longer accepts a decision."}
				</p>
			)}
			{result === null ? null : (
				<output
					aria-atomic="true"
					aria-live="polite"
					className="block pt-control font-sans text-body text-foreground"
					data-approval-result={result.status}
				>
					{resultMessage(result)}
				</output>
			)}
		</article>
	);
}
