import type React from "react";
import { useCallback, useId } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import type {
	VoiceContextDeliveryOutcome,
	VoiceContextEntryView,
	VoiceContextSessionView,
	VoiceContextStatusTone,
} from "../contract.js";

export type VoiceContextCopyTarget =
	| { readonly kind: "brief"; readonly key: string }
	| { readonly kind: "entry"; readonly key: string };

const STATUS_CLASSES = {
	quiet: "border-border bg-surface-subtle text-muted-foreground",
	status: "border-status bg-status-subtle text-status-foreground",
	warning: "border-warning bg-warning-subtle text-warning",
	destructive: "border-destructive bg-destructive-subtle text-destructive",
} as const satisfies Record<VoiceContextStatusTone, string>;

const OUTCOME_CLASSES = {
	delivered: "border-status bg-status-subtle text-status-foreground",
	not_delivered: "border-destructive bg-destructive-subtle text-destructive",
	outcome_unknown: "border-warning bg-warning-subtle text-warning",
} as const satisfies Record<VoiceContextDeliveryOutcome, string>;

type CopyHandler = (text: string, label: string, target: VoiceContextCopyTarget) => void;

function EntryRow({
	entry,
	onCopy,
	onNextBody,
	onCollapseBody,
}: {
	readonly entry: VoiceContextEntryView;
	readonly onCopy: CopyHandler;
	readonly onNextBody: (key: string) => void;
	readonly onCollapseBody: (key: string) => void;
}): React.JSX.Element {
	const bodyId = useId();
	const copyBody = useCallback(
		() =>
			onCopy(entry.body, `${entry.kindLabel} body copied.`, {
				kind: "entry",
				key: entry.expansionKey,
			}),
		[entry.body, entry.expansionKey, entry.kindLabel, onCopy],
	);
	const collapseBody = useCallback(
		() => onCollapseBody(entry.expansionKey),
		[entry.expansionKey, onCollapseBody],
	);
	const nextBody = useCallback(
		() => onNextBody(entry.expansionKey),
		[entry.expansionKey, onNextBody],
	);
	return (
		<li
			className="border-t border-border-subtle first:border-t-0"
			data-voice-context-connection={entry.disconnected ? "disconnected" : "connected"}
			data-voice-context-entry={entry.kind}
			data-voice-context-outcome={entry.outcome}
		>
			<div className="grid grid-cols-4 gap-control border-b border-border-subtle bg-surface-subtle px-control py-control">
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Type</span>
					<span className="text-body font-medium">{entry.kindLabel}</span>
					<code className="block font-mono text-technical text-muted-foreground">{entry.id}</code>
					<code className="block font-mono text-technical text-muted-foreground">
						Order {entry.sourceOrderLabel}
					</code>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">Captured</span>
					<time className="block font-mono text-technical" dateTime={entry.capturedAt}>
						{entry.capturedAt}
					</time>
					<span className="block text-kicker font-semibold text-muted-foreground">Fresh until</span>
					<time className="font-mono text-technical" dateTime={entry.freshUntil}>
						{entry.freshUntil}
					</time>
				</div>
				<div className="min-w-0">
					<span className="block text-kicker font-semibold text-muted-foreground">
						{entry.attemptLabel}
					</span>
					<time className="block font-mono text-technical" dateTime={entry.attemptedAt}>
						{entry.attemptedAt}
					</time>
					<span className="text-body">{entry.freshnessLabel}</span>
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
			</div>
			<div className="grid grid-cols-3 gap-region border-b border-border-subtle px-control py-control">
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Reason</p>
					<p className="m-0 text-body">{entry.reason}</p>
				</div>
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Provenance</p>
					<p className="m-0 text-body">{entry.provenanceLabel}</p>
				</div>
				<div className="min-w-0">
					<p className="m-0 text-kicker font-semibold text-muted-foreground">Connection</p>
					<p className={cn("m-0 text-body", entry.disconnected && "text-offline")}>
						{entry.connectionLabel}
					</p>
				</div>
			</div>
			<div className="px-control py-control">
				<p className="m-0 text-kicker font-semibold text-muted-foreground">{entry.bodyLabel}</p>
				<pre
					className="m-0 font-mono text-technical break-words whitespace-pre-wrap text-foreground"
					id={bodyId}
				>
					{entry.bodyPreview}
				</pre>
			</div>
			<div className="flex min-h-touch-target flex-wrap items-center justify-end gap-control border-t border-border-subtle px-control">
				<Button
					aria-label={`Copy exact body for ${entry.kind} entry ${entry.id}`}
					onClick={copyBody}
					tone="quiet"
				>
					Copy exact body
				</Button>
				{entry.bodyPage > 1 && (
					<Button onClick={collapseBody} tone="quiet">
						Collapse body
					</Button>
				)}
				{entry.bodyRemainingCharacters > 0 && (
					<Button
						aria-controls={bodyId}
						aria-expanded={entry.bodyPage > 1}
						onClick={nextBody}
						tone="quiet"
					>
						Show next {entry.nextBodyCharacters} characters. {entry.bodyRemainingCharacters} remain
					</Button>
				)}
			</div>
		</li>
	);
}

export function VoiceContextSessionRegion({
	session,
	onCopy,
	onNextBrief,
	onCollapseBrief,
	onNextBody,
	onCollapseBody,
	onNextEntries,
	onCollapseEntries,
}: {
	readonly session: VoiceContextSessionView;
	readonly onCopy: CopyHandler;
	readonly onNextBrief: (key: string) => void;
	readonly onCollapseBrief: (key: string) => void;
	readonly onNextBody: (key: string) => void;
	readonly onCollapseBody: (key: string) => void;
	readonly onNextEntries: (key: string) => void;
	readonly onCollapseEntries: (key: string) => void;
}): React.JSX.Element {
	const headingId = useId();
	const briefId = useId();
	const exactBriefId = useId();
	const ledgerId = useId();
	const copyBrief = useCallback(
		() =>
			onCopy(session.canonicalBrief, "Captured start brief copied.", {
				kind: "brief",
				key: session.key,
			}),
		[onCopy, session.canonicalBrief, session.key],
	);
	const collapseBrief = useCallback(
		() => onCollapseBrief(session.key),
		[onCollapseBrief, session.key],
	);
	const nextBrief = useCallback(() => onNextBrief(session.key), [onNextBrief, session.key]);
	const collapseEntries = useCallback(
		() => onCollapseEntries(session.key),
		[onCollapseEntries, session.key],
	);
	const nextEntries = useCallback(() => onNextEntries(session.key), [onNextEntries, session.key]);
	return (
		<article
			aria-labelledby={headingId}
			className="border-t border-border first:border-t-0"
			data-voice-context-replaced={session.replaced ? "true" : "false"}
			data-voice-context-session={session.status}
		>
			<header className="flex min-h-touch-target items-center justify-between gap-control border-b border-border px-region">
				<div className="min-w-0">
					<h3 className="m-0 font-sans text-title font-semibold" id={headingId}>
						{session.heading}
					</h3>
					<p className="m-0 font-mono text-technical text-muted-foreground">
						{session.binding.childId} / {session.binding.epoch} / {session.binding.paneId}
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-control">
					<span className="text-body text-muted-foreground">{session.provenanceLabel}</span>
					<output
						aria-label={`Voice context session status: ${session.statusLabel}`}
						className={cn(
							"rounded-control border px-control py-compact !text-body font-medium",
							STATUS_CLASSES[session.statusTone],
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
								session.briefLabel === "Stale brief" ? "text-warning" : "text-muted-foreground",
							)}
						>
							{session.briefLabel}. {session.briefDetail}
						</p>
					</div>
					<Button
						aria-label={`Copy exact captured start brief for ${session.sessionId}`}
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
						id={exactBriefId}
					>
						{session.canonicalBriefPreview}
					</pre>
					<div className="flex min-h-touch-target flex-wrap items-center justify-end gap-control">
						{session.canonicalBriefPage > 1 && (
							<Button onClick={collapseBrief} tone="quiet">
								Collapse start brief
							</Button>
						)}
						{session.canonicalBriefRemainingCharacters > 0 && (
							<Button
								aria-controls={exactBriefId}
								aria-expanded={session.canonicalBriefPage > 1}
								onClick={nextBrief}
								tone="quiet"
							>
								Show next {session.nextCanonicalBriefCharacters} characters.{" "}
								{session.canonicalBriefRemainingCharacters} remain
							</Button>
						)}
					</div>
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
							authoritative source order.
						</p>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-control">
						{session.entryPage > 1 && (
							<Button onClick={collapseEntries} tone="quiet">
								Collapse to recent deliveries
							</Button>
						)}
						{session.hiddenEntryCount > 0 && (
							<Button onClick={nextEntries} tone="quiet">
								Show next {session.nextEntryCount} earlier deliveries. {session.hiddenEntryCount}{" "}
								remain
							</Button>
						)}
					</div>
				</div>
				{session.entries.length === 0 ? (
					<p className="m-0 border-t border-border-subtle px-region py-panel text-body text-muted-foreground">
						No later delivery has been recorded for this exact session.
					</p>
				) : (
					<ol aria-label="Later voice context deliveries" className="m-0 p-0 list-none">
						{session.entries.map((entry) => (
							<EntryRow
								entry={entry}
								key={entry.id}
								onCollapseBody={onCollapseBody}
								onCopy={onCopy}
								onNextBody={onNextBody}
							/>
						))}
					</ol>
				)}
			</section>
		</article>
	);
}
