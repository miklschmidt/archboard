// The live voice transcript as an accessible live list, with empty, partial
// and terminal states.

import type { BrowserVoice } from "@/shared/codex-browser-model";
import { PanelLine } from "@/ui/workbench/components/PanelLine";

type TranscriptRecord = BrowserVoice["transcript"][number];

/** Inputs for the panel. */
interface TranscriptPanelProps {
	voice: BrowserVoice;
}

const TERMINAL_STATES: ReadonlySet<BrowserVoice["state"]> = new Set([
	"unavailable",
	"stopping",
	"failed",
]);

/**
 * The words for a session that has ended or cannot start.
 * @param voice The published voice state.
 * @returns The terminal line, or null while the session can carry audio.
 */
function terminalText(voice: BrowserVoice): string | null {
	if (!TERMINAL_STATES.has(voice.state)) {
		return null;
	}
	const base = `Voice ${voice.state}`;
	return voice.reason === null || voice.reason === undefined ? base : `${base}: ${voice.reason}`;
}

/** Inputs for one record. */
interface RecordRowProps {
	record: TranscriptRecord;
}

/**
 * One transcript record; a partial one is marked busy and trails an ellipsis.
 * @param props The record.
 * @returns A list item.
 */
function RecordRow(props: RecordRowProps): React.JSX.Element {
	const { record } = props;
	return (
		<li aria-busy={!record.final} className="flex gap-2 py-1.5">
			<span className="text-kicker text-muted-foreground w-12 shrink-0 pt-0.5 uppercase">
				{record.speaker === "user" ? "you" : "agent"}
			</span>
			<span
				className={`text-body min-w-0 break-words ${record.final ? "" : "text-muted-foreground"}`}
			>
				{record.text}
				{record.final ? "" : "…"}
			</span>
		</li>
	);
}

/**
 * The transcript panel.
 * @param props The published voice state.
 * @returns The live list with its empty and terminal lines.
 */
function TranscriptPanel(props: TranscriptPanelProps): React.JSX.Element {
	const { voice } = props;
	const terminal = terminalText(voice);
	return (
		<div className="flex flex-col gap-1">
			{voice.transcript.length === 0 ? (
				<PanelLine tone="muted">Nothing said yet</PanelLine>
			) : (
				<ol aria-live="polite" aria-label="Voice transcript" className="divide-border divide-y">
					{voice.transcript.map((record) => (
						<RecordRow key={record.itemId} record={record} />
					))}
				</ol>
			)}
			{terminal === null ? null : (
				<PanelLine tone={voice.state === "failed" ? "failure" : "muted"}>{terminal}</PanelLine>
			)}
			{voice.delivery === null ? null : (
				<p className="text-technical text-muted-foreground font-mono">
					delivery {voice.delivery.replaceAll("_", " ")}
				</p>
			)}
		</div>
	);
}

export { TranscriptPanel, type TranscriptPanelProps };
