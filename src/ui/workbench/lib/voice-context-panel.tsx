// The captured voice context: the canonical brief the coordinator received,
// with its identity, provenance and freshness, and a Copy that hands the
// exact stored bytes to the caller.

import { RiFileCopyLine } from "@remixicon/react";
import { useCallback } from "react";

import type { BrowserVoiceContext } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import { clockTime, counted, shortId } from "@/ui/workbench/lib/format";
import { PanelLine } from "@/ui/workbench/lib/panel-line";

type VoiceContextEntry = BrowserVoiceContext["entries"][number];

/** Inputs for the panel. */
interface VoiceContextPanelProps {
	/** The published context, or null when no voice session holds one. */
	voiceContext: BrowserVoiceContext | null;
	nowMs: number;
	onCopy: (canonicalBrief: string) => void;
}

/**
 * The freshness words for one entry.
 * @param entry The entry.
 * @param nowMs The clock to judge against.
 * @returns `fresh until HH:MM:SS` or `expired HH:MM:SS`.
 */
function freshnessText(entry: VoiceContextEntry, nowMs: number): string {
	const at = clockTime(entry.freshUntilMs);
	return nowMs > entry.freshUntilMs ? `expired ${at}` : `fresh until ${at}`;
}

/**
 * The delivery words for one entry.
 * @param entry The entry.
 * @returns What happened to it.
 */
function deliveryText(entry: VoiceContextEntry): string {
	if (!entry.attempted) {
		return "not attempted";
	}
	return `${entry.outcome.replaceAll("_", " ")} ${clockTime(entry.attemptedAtMs)}`;
}

/** Inputs for one entry row. */
interface EntryRowProps {
	entry: VoiceContextEntry;
	nowMs: number;
}

/**
 * One context entry: kind, capture time, freshness and delivery.
 * @param props The entry and the clock.
 * @returns A list item.
 */
function EntryRow(props: EntryRowProps): React.JSX.Element {
	const { entry } = props;
	return (
		<li className="flex items-baseline gap-2 py-1.5">
			<span className="text-body w-16 shrink-0 font-medium">{entry.kind}</span>
			<span className="text-technical text-muted-foreground min-w-0 truncate font-mono">
				{clockTime(entry.capturedAtMs)} · {freshnessText(entry, props.nowMs)} ·{" "}
				{deliveryText(entry)}
				{entry.reason === null ? "" : ` · ${entry.reason}`}
			</span>
		</li>
	);
}

/** Inputs for the provenance line. */
interface ProvenanceProps {
	voiceContext: BrowserVoiceContext;
}

/**
 * Identity and provenance: session, ledger, entry counts and omissions.
 * @param props The context.
 * @returns A mono line.
 */
function Provenance(props: ProvenanceProps): React.JSX.Element {
	const context = props.voiceContext;
	const omitted =
		context.entriesTruncated === 0
			? ""
			: ` · ${context.entriesTruncated} omitted (${context.ownerEntriesTruncated} permanently)`;
	return (
		<p className="text-technical text-muted-foreground min-w-0 truncate font-mono">
			session {shortId(context.sessionId)} · ledger {shortId(context.ledgerId)} ·{" "}
			{counted(context.entries.length, "entry", "entries")}
			{omitted}
		</p>
	);
}

/**
 * The voice context panel.
 * @param props The context, the clock, and the copy callback.
 * @returns The brief, provenance and entries, or an empty state.
 */
function VoiceContextPanel(props: VoiceContextPanelProps): React.JSX.Element {
	const { voiceContext, onCopy } = props;
	const brief = voiceContext?.canonicalBrief ?? "";
	const handleCopy = useCallback(() => onCopy(brief), [onCopy, brief]);
	if (voiceContext === null) {
		return <PanelLine tone="muted">No voice context captured</PanelLine>;
	}
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<Provenance voiceContext={voiceContext} />
				<Button
					variant="outline"
					size="icon-xs"
					aria-label="Copy brief"
					className="relative ms-auto shrink-0 rounded-sm after:absolute after:-inset-1"
					onClick={handleCopy}
				>
					<RiFileCopyLine />
				</Button>
			</div>
			<pre className="border-border bg-muted/40 text-technical max-h-40 overflow-auto rounded-sm border p-2 font-mono whitespace-pre-wrap">
				{voiceContext.canonicalBrief}
			</pre>
			{voiceContext.entries.length === 0 ? null : (
				<ol aria-label="Context entries" className="divide-border divide-y">
					{voiceContext.entries.map((entry) => (
						<EntryRow key={entry.id} entry={entry} nowMs={props.nowMs} />
					))}
				</ol>
			)}
		</div>
	);
}

export { VoiceContextPanel, type VoiceContextPanelProps };
