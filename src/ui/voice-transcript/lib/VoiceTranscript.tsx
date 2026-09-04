import { createElement, useId, useMemo, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import {
	VOICE_TRANSCRIPT_CROSS_LINK_KINDS,
	type VoiceTranscriptCrossLinkView,
	type VoiceTranscriptProps,
	type VoiceTranscriptRecordView,
	type VoiceTranscriptSessionState,
	type VoiceTranscriptUnavailableCrossLinkView,
} from "../contract.js";
import { projectVoiceTranscript } from "./projection.js";

const SESSION_TONE_CLASSES = {
	unavailable: "text-muted-foreground",
	ready: "text-muted-foreground",
	requesting_permission: "text-primary",
	negotiating: "text-primary",
	listening: "text-status-foreground",
	muted: "text-warning",
	processing: "text-status-foreground",
	agent_speaking: "text-status-foreground",
	reconnecting: "text-primary",
	stopping: "text-muted-foreground",
	completed: "text-muted-foreground",
	recoverable_failure: "text-warning",
	terminal_failure: "text-destructive",
} as const satisfies Readonly<Record<VoiceTranscriptSessionState, string>>;

const SESSION_MARK_CLASSES = {
	unavailable: "bg-offline",
	ready: "bg-faint-foreground",
	requesting_permission: "bg-primary",
	negotiating: "bg-primary",
	listening: "bg-status",
	muted: "bg-warning",
	processing: "bg-status",
	agent_speaking: "bg-status",
	reconnecting: "bg-primary",
	stopping: "bg-faint-foreground",
	completed: "bg-faint-foreground",
	recoverable_failure: "bg-warning",
	terminal_failure: "bg-destructive",
} as const satisfies Readonly<Record<VoiceTranscriptSessionState, string>>;

const ROLE_CLASSES = {
	user: "text-foreground",
	assistant: "text-muted-foreground",
} as const;

const RECORD_STATUS_CLASSES = {
	provisional: "text-muted-foreground",
	final: "text-foreground",
	interrupted: "text-warning",
} as const;

function CrossLink({ link }: { readonly link: VoiceTranscriptCrossLinkView }): ReactNode {
	return (
		<li className="min-w-0 border-r border-border-subtle last:border-r-0">
			<a
				aria-label={`Inspect ${link.label.toLowerCase()} record`}
				className="flex min-h-touch-target items-center justify-center px-control text-center text-body font-medium text-primary underline-offset-2 hover:bg-surface-hover hover:underline focus-visible:rounded-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				data-transcript-cross-link={link.kind}
				href={`#${link.targetId}`}
			>
				{link.label}
			</a>
		</li>
	);
}

function UnavailableCrossLink({
	link,
}: {
	readonly link: VoiceTranscriptUnavailableCrossLinkView;
}): ReactNode {
	return (
		<li
			className="min-w-0 border-r border-border-subtle last:border-r-0"
			data-transcript-cross-link-unavailable={link.kind}
		>
			<span className="flex min-h-touch-target flex-col items-center justify-center px-control text-center text-body text-muted-foreground">
				<span>{link.label}</span>
				<span className="text-kicker font-medium">Unavailable</span>
			</span>
		</li>
	);
}

function RecordIdentity({ record }: { readonly record: VoiceTranscriptRecordView }): ReactNode {
	return (
		<dl className="m-0 grid grid-cols-3 gap-control border-t border-border-subtle pt-control text-technical">
			<div className="min-w-0">
				<dt className="font-sans text-kicker font-medium text-muted-foreground">Session</dt>
				<dd className="m-0 truncate font-mono text-faint-foreground" title={record.sessionId}>
					{record.sessionId}
				</dd>
			</div>
			<div className="min-w-0">
				<dt className="font-sans text-kicker font-medium text-muted-foreground">Item</dt>
				<dd className="m-0 truncate font-mono text-faint-foreground" title={record.itemId}>
					{record.itemId}
				</dd>
			</div>
			<div className="min-w-0">
				<dt className="font-sans text-kicker font-medium text-muted-foreground">Sequence</dt>
				<dd className="m-0 font-mono text-faint-foreground">{record.sequence}</dd>
			</div>
		</dl>
	);
}

function TranscriptRecord({ record }: { readonly record: VoiceTranscriptRecordView }): ReactNode {
	return (
		<li
			className="border-b border-border px-region py-control last:border-b-0"
			data-transcript-item-id={record.itemId}
			data-transcript-record=""
			data-transcript-role={record.role}
			data-transcript-sequence={record.sequence}
			data-transcript-session-id={record.sessionId}
			data-transcript-status={record.status}
		>
			<article aria-label={`${record.roleLabel} transcript, ${record.statusLabel.toLowerCase()}`}>
				<header className="flex items-baseline justify-between gap-control pb-grid-tight">
					<span className={cn("text-kicker font-semibold", ROLE_CLASSES[record.role])}>
						{record.roleLabel}
					</span>
					<span className={cn("text-kicker font-medium", RECORD_STATUS_CLASSES[record.status])}>
						{record.statusLabel}
					</span>
				</header>
				{record.textSuppressed ? (
					<p
						className="m-0 pb-control text-body text-muted-foreground"
						data-transcript-text="suppressed"
					>
						Transcript text is hidden because this item belongs to another realtime session.
					</p>
				) : (
					<p
						className="m-0 pb-control text-body break-words whitespace-pre-wrap text-foreground"
						data-transcript-text="visible"
					>
						{record.text}
					</p>
				)}
				<RecordIdentity record={record} />
			</article>
		</li>
	);
}

function VisibleSessionStatus({
	hiddenFromAssistiveTechnology,
	label,
	state,
}: {
	readonly hiddenFromAssistiveTechnology: boolean;
	readonly label: string;
	readonly state: VoiceTranscriptSessionState;
}): ReactNode {
	return (
		<span
			aria-hidden={hiddenFromAssistiveTechnology || undefined}
			className="flex items-center gap-grid-tight"
			data-transcript-visible-status=""
		>
			<span
				aria-hidden="true"
				className={cn("size-grid-tight shrink-0 rounded-round", SESSION_MARK_CLASSES[state])}
			/>
			{label}
		</span>
	);
}

export function VoiceTranscript(props: VoiceTranscriptProps): ReactNode {
	const headingId = useId();
	const detailId = useId();
	const view = useMemo(
		() =>
			projectVoiceTranscript({
				records: props.records,
				session: props.session,
				crossLinkIds: props.crossLinkIds,
			}),
		[props.crossLinkIds, props.records, props.session],
	);
	const recovery = view.session.outcome.kind === "none" ? null : view.session.outcome.recovery;
	const announcementOwner = props.announcementOwner ?? "transcript";
	const statusClassName = cn(
		"flex items-center gap-grid-tight text-body font-medium",
		SESSION_TONE_CLASSES[view.sessionState],
	);

	return (
		<section
			aria-describedby={detailId}
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-y border-border bg-surface font-sans text-foreground shadow-flat",
				props.className,
			)}
			data-transcript-content-state={view.contentState}
			data-transcript-session-state={view.sessionState}
			data-voice-transcript=""
		>
			<header className="flex items-center justify-between gap-control border-b border-border px-region py-control">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Live voice</p>
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						{props.label ?? "Voice transcript"}
					</h2>
				</div>
				{announcementOwner === "transcript" ? (
					<output
						aria-atomic="true"
						aria-live="polite"
						className={statusClassName}
						data-transcript-announcement-owner="transcript"
						data-transcript-status-output=""
					>
						<VisibleSessionStatus
							hiddenFromAssistiveTechnology
							label={view.session.label}
							state={view.sessionState}
						/>
						<span className="sr-only">{view.session.accessibleStatus}</span>
					</output>
				) : (
					<div
						className={statusClassName}
						data-transcript-announcement-owner="external"
						data-transcript-status-output=""
					>
						<VisibleSessionStatus
							hiddenFromAssistiveTechnology={false}
							label={view.session.label}
							state={view.sessionState}
						/>
					</div>
				)}
			</header>
			<div className="border-b border-border px-region py-control" id={detailId}>
				<p className="m-0 text-body text-muted-foreground">{view.session.detail}</p>
				{recovery === null ? null : (
					<p className="m-0 pt-compact text-body text-muted-foreground">{recovery}</p>
				)}
			</div>
			{/* The shared log pattern is intentionally keyboard-focusable. Oxlint's
			    JSX rule does not include ARIA log in its focusable-role allowlist, so
			    this matches WorkbenchTimeline's explicit React element spelling. */}
			{createElement(
				"div",
				{
					"aria-busy": view.busy || undefined,
					"aria-labelledby": headingId,
					"aria-relevant": "additions",
					className:
						"min-h-0 overflow-y-auto bg-surface-raised outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
					"data-transcript-log": "",
					role: "log",
					tabIndex: 0,
				},
				view.records.length === 0 ? (
					<p className="m-0 px-region py-panel text-body text-muted-foreground">
						No transcript items have arrived for this voice session.
					</p>
				) : (
					<ol className="m-0 p-0 list-none" data-transcript-records="">
						{view.records.map((record) => (
							<TranscriptRecord key={record.key} record={record} />
						))}
					</ol>
				),
			)}
			<nav
				aria-label="Related workbench records"
				className="border-t border-border"
				data-transcript-relationship-state={
					view.unavailableCrossLinks.length === 0
						? "available"
						: view.crossLinks.length === 0
							? "unavailable"
							: "partial"
				}
			>
				<ul className="m-0 p-0 grid list-none grid-cols-6">
					{VOICE_TRANSCRIPT_CROSS_LINK_KINDS.map((kind) => {
						const link = view.crossLinks.find((candidate) => candidate.kind === kind);
						if (link !== undefined) return <CrossLink key={kind} link={link} />;
						const unavailable = view.unavailableCrossLinks.find(
							(candidate) => candidate.kind === kind,
						);
						return unavailable === undefined ? null : (
							<UnavailableCrossLink key={kind} link={unavailable} />
						);
					})}
				</ul>
			</nav>
		</section>
	);
}
