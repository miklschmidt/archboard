import type React from "react";
import { useCallback, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import type {
	VoiceContextClipboardPort,
	VoiceContextDeliveryOutcome,
	VoiceContextEntryView,
	VoiceContextPanelProps,
	VoiceContextSessionStatus,
	VoiceContextSessionView,
} from "../contract.js";
import { projectVoiceContext } from "./projection.js";

const SESSION_CLASSES = {
	active: "border-status bg-status-subtle text-status-foreground",
	replaced: "border-warning bg-warning-subtle text-warning",
	stopped: "border-border bg-surface-subtle text-muted-foreground",
} as const satisfies Record<VoiceContextSessionStatus["state"], string>;

const OUTCOME_CLASSES = {
	delivered: "border-status bg-status-subtle text-status-foreground",
	not_delivered: "border-destructive bg-destructive-subtle text-destructive",
	outcome_unknown: "border-warning bg-warning-subtle text-warning",
} as const satisfies Record<VoiceContextDeliveryOutcome, string>;

const browserClipboard: VoiceContextClipboardPort = Object.freeze({
	writeText: async (value: string) => {
		const clipboard = globalThis.navigator?.clipboard;
		if (clipboard === undefined)
			throw new Error("Clipboard access is unavailable in this browser.");
		await clipboard.writeText(value);
	},
});

interface CopyNotice {
	readonly state: "success" | "failure";
	readonly text: string;
}

function toggle(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
	const next = new Set(set);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	return next;
}

function EntryRow({
	entry,
	onCopy,
	onToggle,
}: {
	readonly entry: VoiceContextEntryView;
	readonly onCopy: (text: string, label: string) => void;
	readonly onToggle: (key: string) => void;
}): React.JSX.Element {
	const bodyId = useId();
	const copyBody = useCallback(
		() => onCopy(entry.body, `${entry.kindLabel} body copied.`),
		[entry.body, entry.kindLabel, onCopy],
	);
	const toggleBody = useCallback(
		() => onToggle(entry.expansionKey),
		[entry.expansionKey, onToggle],
	);
	return (
		<li
			className="border-t border-border-subtle first:border-t-0"
			data-voice-context-connection={entry.disconnected ? "disconnected" : "connected"}
			data-voice-context-entry={entry.kind}
			data-voice-context-outcome={entry.outcome}
		>
			<div className="grid grid-cols-6 gap-control border-b border-border-subtle bg-surface-subtle px-control py-control">
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Type</span>
					<span className="text-body font-medium">{entry.kindLabel}</span>
					<code className="block font-mono text-technical text-muted-foreground">{entry.id}</code>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Captured</span>
					<time className="font-mono text-technical" dateTime={entry.capturedAt}>
						{entry.capturedAt}
					</time>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">
						{entry.attemptLabel}
					</span>
					<time className="font-mono text-technical" dateTime={entry.attemptedAt}>
						{entry.attemptedAt}
					</time>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Outcome</span>
					<output
						className={cn(
							"inline-block rounded-compact border px-compact py-rule !text-body font-medium",
							OUTCOME_CLASSES[entry.outcome],
						)}
					>
						{entry.outcomeLabel}
					</output>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Provenance</span>
					<span className="text-body">{entry.provenanceLabel}</span>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Connection</span>
					<span className={entry.disconnected ? "text-offline" : "text-muted-foreground"}>
						{entry.connectionLabel}
					</span>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-region px-control py-control">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Reason</p>
					<p className="m-0 text-body">{entry.reason}</p>
				</div>
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">{entry.bodyLabel}</p>
					<pre
						className="m-0 font-mono text-technical break-words whitespace-pre-wrap text-foreground"
						id={bodyId}
					>
						{entry.bodyPreview}
					</pre>
				</div>
			</div>
			<div className="flex min-h-touch-target flex-wrap items-center justify-end gap-control border-t border-border-subtle px-control">
				<Button
					aria-label={`Copy exact body for ${entry.kind} entry ${entry.id}`}
					onClick={copyBody}
					tone="quiet"
				>
					Copy exact body
				</Button>
				{entry.bodyTruncated && (
					<Button
						aria-controls={bodyId}
						aria-expanded={entry.bodyExpanded}
						onClick={toggleBody}
						tone="quiet"
					>
						{entry.bodyExpanded ? "Collapse exact body" : "Show exact body"}
					</Button>
				)}
			</div>
		</li>
	);
}

function SessionRegion({
	session,
	onCopy,
	onToggleBrief,
	onToggleEntry,
	onToggleEntries,
}: {
	readonly session: VoiceContextSessionView;
	readonly onCopy: (text: string, label: string) => void;
	readonly onToggleBrief: (key: string) => void;
	readonly onToggleEntry: (key: string) => void;
	readonly onToggleEntries: (key: string) => void;
}): React.JSX.Element {
	const headingId = useId();
	const briefId = useId();
	const ledgerId = useId();
	const copyBrief = useCallback(
		() => onCopy(session.canonicalBrief, "Captured start brief copied."),
		[onCopy, session.canonicalBrief],
	);
	const toggleBrief = useCallback(() => onToggleBrief(session.key), [onToggleBrief, session.key]);
	const toggleEntries = useCallback(
		() => onToggleEntries(session.key),
		[onToggleEntries, session.key],
	);
	return (
		<article
			aria-labelledby={headingId}
			className="border-t border-border first:border-t-0"
			data-voice-context-session={session.status}
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border px-region">
				<div className="min-w-0">
					<h3 className="m-0 font-sans text-title font-semibold" id={headingId}>
						{session.heading}
					</h3>
					<p className="m-0 font-mono text-technical text-muted-foreground">
						{session.identity.childId} / {session.identity.epoch} / {session.identity.paneId}
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-control">
					<span className="text-body text-muted-foreground">{session.provenanceLabel}</span>
					<output
						aria-label={`Voice context session status: ${session.statusLabel}`}
						className={cn(
							"rounded-control border px-control py-compact !text-body font-medium",
							SESSION_CLASSES[session.status],
						)}
					>
						{session.statusLabel}
					</output>
				</div>
			</header>
			<p className="m-0 border-b border-border-subtle px-region py-control text-body text-muted-foreground">
				{session.statusDetail}
			</p>

			<section aria-labelledby={briefId} className="px-region py-panel">
				<div className="flex min-h-touch-target items-center justify-between gap-control border-b border-border">
					<div>
						<h4 className="m-0 text-control font-semibold" id={briefId}>
							Captured start brief
						</h4>
						<p
							className={cn(
								"m-0 !text-body",
								session.briefState === "stale" ? "text-warning" : "text-muted-foreground",
							)}
						>
							{session.briefLabel}. {session.briefDetail}
						</p>
					</div>
					<Button
						aria-label={`Copy exact captured start brief for ${session.identity.realtimeSessionId}`}
						onClick={copyBrief}
						tone="secondary"
					>
						Copy start brief
					</Button>
				</div>
				<dl className="m-0 grid grid-cols-2 border-b border-border">
					{session.fields.map((field) => (
						<div
							className="min-w-0 grid grid-cols-2 gap-control border-b border-border-subtle px-control py-control"
							key={field.label}
						>
							<dt className="text-body font-medium text-muted-foreground">{field.label}</dt>
							<dd
								className={cn(
									"m-0 min-w-0 text-body break-words",
									field.technical ? "font-mono text-technical" : "font-sans",
								)}
							>
								{field.value}
							</dd>
						</div>
					))}
				</dl>
				<div className="border-b border-border px-control py-control">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">
						Exact canonical brief
					</p>
					<pre
						className="m-0 font-mono text-technical break-words whitespace-pre-wrap"
						data-voice-context-brief=""
					>
						{session.canonicalBriefPreview}
					</pre>
					{session.canonicalBriefTruncated && (
						<div className="mt-control flex justify-end">
							<Button
								aria-expanded={session.canonicalBriefExpanded}
								onClick={toggleBrief}
								tone="quiet"
							>
								{session.canonicalBriefExpanded ? "Collapse start brief" : "Show exact start brief"}
							</Button>
						</div>
					)}
				</div>
			</section>

			<section aria-labelledby={ledgerId} className="border-t border-border">
				<div className="flex min-h-touch-target items-center justify-between gap-control px-region">
					<div>
						<h4 className="m-0 text-control font-semibold" id={ledgerId}>
							Later deliveries
						</h4>
						<p className="m-0 text-body text-muted-foreground">
							{session.entryCount} exact {session.entryCount === 1 ? "record" : "records"}, in
							capture order.
						</p>
					</div>
					{(session.hiddenEntryCount > 0 || session.entriesExpanded) && (
						<Button aria-expanded={session.entriesExpanded} onClick={toggleEntries} tone="quiet">
							{session.entriesExpanded
								? "Show recent deliveries"
								: `Show ${session.hiddenEntryCount} earlier deliveries`}
						</Button>
					)}
				</div>
				{session.entries.length === 0 ? (
					<p className="m-0 border-t border-border-subtle px-region py-panel text-body text-muted-foreground">
						No later delivery has been recorded for this exact session.
					</p>
				) : (
					<ol aria-label="Later voice context deliveries" className="m-0 p-0 list-none">
						{session.entries.map((entry) => (
							<EntryRow entry={entry} key={entry.id} onCopy={onCopy} onToggle={onToggleEntry} />
						))}
					</ol>
				)}
			</section>
		</article>
	);
}

export function VoiceContextPanel({
	history,
	clipboard = browserClipboard,
	limits,
	className,
}: VoiceContextPanelProps): React.JSX.Element {
	const snapshot = useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot);
	const [showAllSessions, setShowAllSessions] = useState(false);
	const [expandedSessions, setExpandedSessions] = useState<ReadonlySet<string>>(new Set());
	const [expandedBriefs, setExpandedBriefs] = useState<ReadonlySet<string>>(new Set());
	const [expandedEntries, setExpandedEntries] = useState<ReadonlySet<string>>(new Set());
	const [copyNotice, setCopyNotice] = useState<CopyNotice | null>(null);
	const headingId = useId();

	const view = projectVoiceContext({
		snapshot,
		showAllSessions,
		expandedSessions,
		expandedBriefs,
		expandedEntries,
		limits,
	});
	const copy = useCallback(
		(value: string, label: string) => {
			void Promise.resolve()
				.then(() => clipboard.writeText(value))
				.then(
					() => setCopyNotice({ state: "success", text: label }),
					() =>
						setCopyNotice({
							state: "failure",
							text: "Copy failed. Select the exact text in the panel and copy it manually.",
						}),
				);
		},
		[clipboard],
	);
	const toggleSessions = useCallback(() => setShowAllSessions((current) => !current), []);
	const toggleBrief = useCallback(
		(key: string) => setExpandedBriefs((current) => toggle(current, key)),
		[],
	);
	const toggleEntries = useCallback(
		(key: string) => setExpandedSessions((current) => toggle(current, key)),
		[],
	);
	const toggleEntry = useCallback(
		(key: string) => setExpandedEntries((current) => toggle(current, key)),
		[],
	);

	return (
		<section
			aria-labelledby={headingId}
			className={cn(
				"min-w-0 border-y border-border bg-surface font-sans text-foreground shadow-flat",
				className,
			)}
			data-voice-context=""
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border px-region">
				<div>
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Voice evidence</p>
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						Voice context
					</h2>
				</div>
				{(view.hiddenSessionCount > 0 || view.sessionsExpanded) && (
					<Button aria-expanded={view.sessionsExpanded} onClick={toggleSessions} tone="quiet">
						{view.sessionsExpanded
							? "Show recent sessions"
							: `Show ${view.hiddenSessionCount} earlier sessions`}
					</Button>
				)}
			</header>
			<output
				aria-atomic="true"
				aria-live="polite"
				className={cn(
					"block min-h-touch-target border-b border-border-subtle px-region py-control !text-body",
					copyNotice?.state === "failure" ? "text-destructive" : "text-muted-foreground",
				)}
				data-voice-context-copy-status={copyNotice?.state ?? "idle"}
			>
				{copyNotice?.text ??
					"Copy actions preserve the exact canonical strings captured in this ledger."}
			</output>
			{view.sessions.length === 0 ? (
				<p className="m-0 px-region py-panel text-body text-muted-foreground">
					No voice session has captured context yet.
				</p>
			) : (
				view.sessions.map((session) => (
					<SessionRegion
						key={session.key}
						onCopy={copy}
						onToggleBrief={toggleBrief}
						onToggleEntries={toggleEntries}
						onToggleEntry={toggleEntry}
						session={session}
					/>
				))
			)}
		</section>
	);
}
