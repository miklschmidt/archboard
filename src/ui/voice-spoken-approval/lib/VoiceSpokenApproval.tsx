import { useId, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type {
	VoiceSpokenApprovalProps,
	VoiceSpokenApprovalState,
	VoiceSpokenApprovalUtterance,
	VoiceSpokenApprovalView,
} from "../contract.js";
import { projectVoiceSpokenApproval } from "./projection.js";

const STATE_CLASSES = {
	eligible: "border-primary bg-primary-subtle text-primary",
	ineligible: "border-border bg-surface-subtle text-muted-foreground",
	armed: "border-status bg-status-subtle text-status-foreground",
	expired: "border-warning bg-warning-subtle text-warning",
	resolving: "border-status bg-status-subtle text-status-foreground",
	visual_fallback: "border-warning bg-warning-subtle text-warning",
	outcome_unknown: "border-warning bg-warning-subtle text-warning",
	duplicate: "border-warning bg-warning-subtle text-warning",
	stale_session: "border-destructive bg-destructive-subtle text-destructive",
} as const satisfies Record<VoiceSpokenApprovalState, string>;

function EvidenceRows({
	label,
	rows,
}: {
	readonly label: string;
	readonly rows: VoiceSpokenApprovalView["request"];
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
				{rows.map((row) => (
					<div
						className="grid min-w-0 grid-cols-2 gap-control border-t border-border-subtle py-compact first:border-t-0"
						data-spoken-evidence-row={row.label}
						key={row.label}
					>
						<dt className="font-sans text-body font-medium text-muted-foreground">{row.label}</dt>
						<dd
							className={cn(
								"m-0 min-w-0 text-body break-words text-foreground",
								row.technical ? "font-mono" : "font-sans",
							)}
						>
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function Utterance({ item }: { readonly item: VoiceSpokenApprovalUtterance }): ReactNode {
	return (
		<section
			aria-label="Spoken utterance evidence"
			className="border-t border-border-subtle pt-control"
			data-spoken-evidence-authority={item.authority}
		>
			<div className="flex items-baseline justify-between gap-control">
				<h4 className="m-0 font-sans text-kicker font-semibold text-muted-foreground">
					{item.label}
				</h4>
				<span className="font-sans text-body text-muted-foreground">
					Eligible for later classification
				</span>
			</div>
			<dl className="m-0 grid grid-cols-3 gap-region py-compact">
				<div className="min-w-0">
					<dt className="font-sans text-kicker font-medium text-muted-foreground">Item</dt>
					<dd className="m-0 font-mono text-technical break-words text-foreground">
						{String(item.itemId)}
					</dd>
				</div>
				<div className="min-w-0">
					<dt className="font-sans text-kicker font-medium text-muted-foreground">Session</dt>
					<dd className="m-0 font-mono text-technical break-words text-foreground">
						{String(item.realtimeSessionId)}
					</dd>
				</div>
				<div className="min-w-0">
					<dt className="font-sans text-kicker font-medium text-muted-foreground">Sequence</dt>
					<dd className="m-0 font-mono text-technical text-foreground">{item.sequence}</dd>
				</div>
			</dl>
			<p className="m-0 border-t border-border-subtle pt-compact font-sans text-body text-foreground">
				{item.text}
			</p>
		</section>
	);
}

export function VoiceSpokenApproval(props: VoiceSpokenApprovalProps): ReactNode {
	const headingId = useId();
	const view = projectVoiceSpokenApproval(props);
	return (
		<section
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-b border-border-subtle bg-surface px-region py-control font-sans text-foreground",
				props.className,
			)}
			data-spoken-approval="display-only"
			data-spoken-approval-state={view.state}
			data-visual-card-preserved="true"
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Spoken approval</p>
					<h3 className="m-0 text-title font-semibold" id={headingId}>
						Voice evidence
					</h3>
				</div>
				<output
					aria-atomic="true"
					aria-label={`Spoken approval status: ${view.label}`}
					aria-live="polite"
					className={cn(
						"shrink-0 rounded-control border px-control py-compact text-body font-medium",
						STATE_CLASSES[view.state],
					)}
					data-spoken-approval-status=""
				>
					{view.label}
				</output>
			</header>
			<p className="m-0 py-compact text-body text-foreground">{view.detail}</p>
			<p className="m-0 pb-control text-body font-medium text-muted-foreground">
				The ordinary approval card stays visible.
			</p>
			{view.classifierNotice === null ? null : (
				<p
					className="m-0 border-y border-border-subtle py-compact text-body text-muted-foreground"
					data-spoken-classifier-notice="true"
				>
					{view.classifierNotice}
				</p>
			)}
			<div className="grid grid-cols-3 gap-region py-control">
				<EvidenceRows label="Request identity" rows={view.request} />
				<EvidenceRows label="Requested effect" rows={view.effect} />
				<EvidenceRows label="Approval source" rows={view.source} />
			</div>
			{view.gate.length === 0 ? null : <EvidenceRows label="Spoken gate" rows={view.gate} />}
			{view.utterance === null ? null : <Utterance item={view.utterance} />}
		</section>
	);
}
