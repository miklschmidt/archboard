// What the voice agent was told, in the session's details: the canonical
// brief its session started with — shown, and copied, byte for byte as it was
// captured — and each later piece of context with when it was captured and
// whether it was delivered.

import { RiFileCopyLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import { IconAction } from "#ui/components/dock/IconAction.tsx";
import { clockTime, counted } from "#ui/rules/dock/format.ts";

type VoiceContext = NonNullable<BrowserSnapshot["voiceContext"]>;
type VoiceContextEntry = VoiceContext["entries"][number];

/** Inputs for the voice context. */
interface VoiceContextDetailsProps {
	/** The published context, or null or absent while no voice session holds one. */
	readonly voiceContext: VoiceContext | null | undefined;
}

/**
 * Where one piece of context stands: captured, and delivered or not.
 * @param entry The entry.
 * @returns The words.
 */
function entryWords(entry: VoiceContextEntry): string {
	const delivery = entry.attempted
		? `${entry.outcome.replaceAll("_", " ")} ${clockTime(entry.attemptedAtMs)}`
		: "not attempted";
	return `${clockTime(entry.capturedAtMs)} · ${delivery}${entry.reason === null ? "" : ` · ${entry.reason}`}`;
}

/**
 * What the voice agent was told.
 * @param props The published context.
 * @returns The brief and its entries, or nothing while voice holds none.
 */
function VoiceContextDetails(props: VoiceContextDetailsProps): JSX.Element | null {
	const { voiceContext } = props;
	if (voiceContext === null || voiceContext === undefined) return null;
	return <VoiceContextBody voiceContext={voiceContext} />;
}

/**
 * How many later entries there are, and how many were left out.
 * @param context The context.
 * @returns The words.
 */
function entriesWords(context: VoiceContext): string {
	const omitted = context.entriesTruncated === 0 ? "" : ` · ${context.entriesTruncated} omitted`;
	return `${counted(context.entries.length, "later entry", "later entries")}${omitted}`;
}

/**
 * The brief, its copy, and the later entries.
 * @param props The context.
 * @param props.voiceContext The published context.
 * @returns The body.
 */
function VoiceContextBody(props: { readonly voiceContext: VoiceContext }): JSX.Element {
	const { voiceContext } = props;
	const brief = voiceContext.canonicalBrief;
	const copy = useCallback(() => {
		void navigator.clipboard.writeText(brief);
	}, [brief]);
	return (
		<div data-slot="voice-context" className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<span className="text-body text-muted-foreground min-w-0 flex-1">
					What voice was told · {entriesWords(voiceContext)}
				</span>
				<IconAction label="Copy the brief" variant="outline" onClick={copy}>
					<RiFileCopyLine />
				</IconAction>
			</div>
			<pre className="border-border bg-muted/40 text-technical rounded-control max-h-48 overflow-auto border p-2 font-mono whitespace-pre-wrap">
				{brief}
			</pre>
			{voiceContext.entries.length > 0 && (
				<ol aria-label="Later context" className="flex flex-col gap-0.5">
					{voiceContext.entries.map((entry) => (
						<li key={entry.id} className="flex items-baseline gap-2">
							<span className="text-body w-16 shrink-0 font-medium">{entry.kind}</span>
							<span className="text-technical text-muted-foreground min-w-0 truncate font-mono">
								{entryWords(entry)}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export { VoiceContextDetails, type VoiceContextDetailsProps };
