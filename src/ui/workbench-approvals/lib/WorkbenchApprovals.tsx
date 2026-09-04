import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type { BrowserWorkbenchCommandTarget } from "../../workbench-transport/index.js";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalField,
	WorkbenchApprovalFieldError,
	WorkbenchApprovalFormEvent,
	WorkbenchApprovalFormState,
	WorkbenchApprovalsProps,
} from "../contract.js";
import { ApprovalCard } from "./ApprovalCard.js";
import { approvalDecisionSignature, approvalFocusReturn } from "./focus.js";
import { applyApprovalFormEvent, initialApprovalForm } from "./form.js";
import { projectWorkbenchApprovals } from "./projection.js";
import { submitApprovalDecision } from "./submit.js";

type FormMap = Readonly<Record<string, WorkbenchApprovalFormState>>;
type ErrorMap = Readonly<Record<string, readonly WorkbenchApprovalFieldError[]>>;
type ResultMap = Readonly<Record<string, WorkbenchApprovalDecisionResult>>;

interface OfferedDecisions {
	readonly cards: readonly WorkbenchApprovalCard[];
	readonly forms: FormMap;
	readonly target: BrowserWorkbenchCommandTarget | null;
	readonly transport: WorkbenchApprovalsProps["transport"];
}

interface TrackedDecisions {
	readonly signature: string;
	readonly announcement: string | null;
}

const EMPTY_ERRORS: readonly WorkbenchApprovalFieldError[] = Object.freeze([]);
const EMPTY_FIELDS: readonly WorkbenchApprovalField[] = Object.freeze([]);

function cardFields(card: WorkbenchApprovalCard): readonly WorkbenchApprovalField[] {
	return card.kind === "ordinary" ? card.fields : EMPTY_FIELDS;
}

/**
 * The target is read while the offers are on screen, so it is the target the
 * person was actually looking at. The transport refuses the command outright if
 * the workbench has moved on since, rather than answering another thread's
 * request.
 */
function captureTarget(
	transport: WorkbenchApprovalsProps["transport"],
	needed: boolean,
): BrowserWorkbenchCommandTarget | null {
	if (!needed) return null;
	try {
		return transport.captureCommandTarget();
	} catch {
		return null;
	}
}

export function WorkbenchApprovals({
	state,
	transport,
	now,
	className,
}: WorkbenchApprovalsProps): ReactNode {
	const headingId = useId();
	const beaconId = useId();
	const headingRef = useRef<HTMLHeadingElement | null>(null);
	const [forms, setForms] = useState<FormMap>({});
	const [errors, setErrors] = useState<ErrorMap>({});
	const [results, setResults] = useState<ResultMap>({});
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [focusedKey, setFocusedKey] = useState<string | null>(null);

	const nowMs = (now ?? Date.now)();
	const view = projectWorkbenchApprovals({
		state,
		nowMs,
		canCommand: transport.capabilities().canCommand,
	});
	const signature = approvalDecisionSignature(view.cards);
	const [tracked, setTracked] = useState<TrackedDecisions>({ signature, announcement: null });
	if (tracked.signature !== signature) {
		const change = approvalFocusReturn(tracked.signature, view.cards, focusedKey);
		setTracked({ signature, announcement: change === null ? null : change.announcement });
		if (change !== null) setFocusedKey(null);
	}
	const announcement = tracked.signature === signature ? tracked.announcement : null;

	useEffect(() => {
		if (announcement !== null) headingRef.current?.focus();
	}, [announcement]);

	const decidableCount = view.cards.filter((card) => card.offers.length > 0).length;
	const commandTarget = captureTarget(transport, decidableCount > 0);
	const offered = useRef<OfferedDecisions>({ cards: view.cards, forms, target: null, transport });
	useEffect(() => {
		offered.current = { cards: view.cards, forms, target: commandTarget, transport };
	});

	const handleFormEvent = useCallback(
		(cardKey: string, event: WorkbenchApprovalFormEvent): void => {
			const card = offered.current.cards.find((candidate) => candidate.key === cardKey);
			if (card === undefined) return;
			setForms((previous) => {
				const current = previous[cardKey] ?? initialApprovalForm(cardFields(card));
				return Object.freeze({ ...previous, [cardKey]: applyApprovalFormEvent(current, event) });
			});
		},
		[],
	);

	const handleDecide = useCallback((cardKey: string, offerId: string): void => {
		const live = offered.current;
		const card = live.cards.find((candidate) => candidate.key === cardKey);
		if (card === undefined) return;
		setBusyKey(cardKey);
		const decide = async (): Promise<void> => {
			const outcome = await submitApprovalDecision({
				transport: live.transport,
				card,
				offerId,
				form: live.forms[cardKey] ?? initialApprovalForm(cardFields(card)),
				target: live.target,
			});
			setBusyKey(null);
			setResults((previous) => Object.freeze({ ...previous, [cardKey]: outcome }));
			setErrors((previous) =>
				Object.freeze({
					...previous,
					[cardKey]: outcome.status === "invalid" ? outcome.errors : EMPTY_ERRORS,
				}),
			);
		};
		void decide();
	}, []);

	const handleFocusCard = useCallback((cardKey: string): void => {
		setFocusedKey(cardKey);
	}, []);

	const rows = view.cards.map((card) => ({
		card,
		busy: busyKey === card.key,
		errors: errors[card.key] ?? EMPTY_ERRORS,
		form: forms[card.key] ?? initialApprovalForm(cardFields(card)),
		result: results[card.key] ?? null,
	}));

	return (
		<section
			aria-describedby={beaconId}
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-y border-border bg-surface font-sans text-foreground shadow-flat",
				className,
			)}
			data-approvals-authority={view.authority}
			data-workbench-approvals="surface"
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border px-region py-control">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Codex approvals</p>
					<h2
						className="m-0 text-title font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
						id={headingId}
						ref={headingRef}
						tabIndex={-1}
					>
						Approval requests
					</h2>
				</div>
				<span className="shrink-0 rounded-control border border-border bg-surface-subtle px-control py-compact text-body font-medium text-foreground">
					{view.beacon.pending} waiting
				</span>
			</header>
			<div
				className="border-b border-border-subtle px-region py-control"
				data-approvals-scope="app-global"
				id={beaconId}
			>
				<output
					aria-atomic="true"
					aria-live="assertive"
					className="block text-body text-foreground"
				>
					{view.beacon.announcement}
				</output>
				<ul className="m-0 p-0 list-none">
					{view.beacon.entries.map((entry) => (
						<li
							className="text-body text-muted-foreground"
							data-approval-beacon={entry.key}
							data-approval-beacon-phase={entry.phase}
							key={entry.key}
						>
							{entry.label} — {entry.target}
						</li>
					))}
				</ul>
				{announcement === null ? null : (
					<output
						aria-atomic="true"
						aria-live="assertive"
						className="block text-body text-muted-foreground"
						data-approvals-focus-return="true"
					>
						{announcement}
					</output>
				)}
			</div>
			{view.authorityReason === null ? null : (
				<p
					className="m-0 border-b border-border-subtle px-region py-control text-body text-muted-foreground"
					data-approvals-authority-reason="true"
				>
					{view.authorityReason}
				</p>
			)}
			{view.reconciliation === null ? null : (
				<p
					className="m-0 border-b border-border-subtle px-region py-control text-body text-foreground"
					data-approvals-reconciliation={view.reconciliation.outcome}
				>
					{view.reconciliation.label}: {view.reconciliation.detail}
				</p>
			)}
			{view.empty === null ? null : (
				<p className="m-0 px-region py-control text-body text-muted-foreground">{view.empty}</p>
			)}
			{rows.map((row) => (
				<ApprovalCard
					busy={row.busy}
					card={row.card}
					errors={row.errors}
					form={row.form}
					key={row.card.key}
					onDecide={handleDecide}
					onFocusCard={handleFocusCard}
					onFormEvent={handleFormEvent}
					result={row.result}
				/>
			))}
		</section>
	);
}
