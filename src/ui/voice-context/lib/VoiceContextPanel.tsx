import type React from "react";
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import type { VoiceContextClipboardPort, VoiceContextPanelProps } from "../contract.js";
import { ingestVoiceContextBrowserEvidence } from "./browser-evidence.js";
import { projectVoiceContext } from "./projection.js";
import { VoiceContextSessionRegion, type VoiceContextCopyTarget } from "./VoiceContextRows.js";

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

function shift(
	current: ReadonlyMap<string, number>,
	key: string,
	delta: -1 | 1,
): ReadonlyMap<string, number> {
	const next = new Map(current);
	next.set(key, Math.max(1, (next.get(key) ?? 1) + delta));
	return next;
}

function reset(current: ReadonlyMap<string, number>, key: string): ReadonlyMap<string, number> {
	const next = new Map(current);
	next.delete(key);
	return next;
}

export function VoiceContextPanel({
	history,
	browserEvidence,
	clipboard = browserClipboard,
	limits,
	className,
}: VoiceContextPanelProps): React.JSX.Element {
	useEffect(() => {
		if (browserEvidence !== null && browserEvidence !== undefined)
			ingestVoiceContextBrowserEvidence(history, browserEvidence);
	}, [browserEvidence, history]);
	const snapshot = useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot);
	const [sessionPage, setSessionPage] = useState(1);
	const [entryPages, setEntryPages] = useState<ReadonlyMap<string, number>>(new Map());
	const [briefPages, setBriefPages] = useState<ReadonlyMap<string, number>>(new Map());
	const [entryBodyPages, setEntryBodyPages] = useState<ReadonlyMap<string, number>>(new Map());
	const [copyNotice, setCopyNotice] = useState<CopyNotice | null>(null);
	const headingId = useId();
	const view = projectVoiceContext({
		snapshot,
		sessionPage,
		entryPages,
		briefPages,
		entryBodyPages,
		limits,
	});
	const copy = useCallback(
		(value: string, label: string, target: VoiceContextCopyTarget) => {
			void Promise.resolve()
				.then(() => clipboard.writeText(value))
				.then(
					() => setCopyNotice({ state: "success", text: label }),
					() => {
						if (target.kind === "brief") setBriefPages((current) => reset(current, target.key));
						else setEntryBodyPages((current) => reset(current, target.key));
						setCopyNotice({
							state: "failure",
							text: "Copy failed. The exact target is at its first bounded window below; use Previous and Next to select and copy each segment manually.",
						});
					},
				);
		},
		[clipboard],
	);
	const firstSessions = useCallback(() => setSessionPage(1), []);
	const previousSessions = useCallback(
		() => setSessionPage((current) => Math.max(1, current - 1)),
		[],
	);
	const nextSessions = useCallback(() => setSessionPage((current) => current + 1), []);
	const collapseBody = useCallback(
		(key: string) => setEntryBodyPages((current) => reset(current, key)),
		[],
	);
	const collapseBrief = useCallback(
		(key: string) => setBriefPages((current) => reset(current, key)),
		[],
	);
	const collapseEntries = useCallback(
		(key: string) => setEntryPages((current) => reset(current, key)),
		[],
	);
	const nextBody = useCallback(
		(key: string) => setEntryBodyPages((current) => shift(current, key, 1)),
		[],
	);
	const previousBody = useCallback(
		(key: string) => setEntryBodyPages((current) => shift(current, key, -1)),
		[],
	);
	const nextBrief = useCallback(
		(key: string) => setBriefPages((current) => shift(current, key, 1)),
		[],
	);
	const previousBrief = useCallback(
		(key: string) => setBriefPages((current) => shift(current, key, -1)),
		[],
	);
	const nextEntries = useCallback(
		(key: string) => setEntryPages((current) => shift(current, key, 1)),
		[],
	);
	const previousEntries = useCallback(
		(key: string) => setEntryPages((current) => shift(current, key, -1)),
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
					<h2 className="m-0 text-title font-semibold" id={headingId}>
						Voice context
					</h2>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-control">
					{view.sessionPage > 1 && (
						<Button onClick={firstSessions} tone="quiet">
							Back to newest sessions
						</Button>
					)}
					{view.newerSessionCount > 0 && (
						<Button onClick={previousSessions} tone="quiet">
							Previous {view.newerSessionCount} newer sessions
						</Button>
					)}
					{view.hiddenSessionCount > 0 && (
						<Button onClick={nextSessions} tone="quiet">
							Show next {view.nextSessionCount} earlier sessions. {view.hiddenSessionCount} remain
						</Button>
					)}
				</div>
			</header>
			{copyNotice === null ? null : (
				<output
					aria-atomic="true"
					aria-live="polite"
					className={cn(
						"block min-h-touch-target border-b border-border-subtle px-region py-control !text-body",
						copyNotice?.state === "failure" ? "text-destructive" : "text-muted-foreground",
					)}
					data-voice-context-copy-status={copyNotice?.state ?? "idle"}
				>
					{copyNotice.text}
				</output>
			)}
			{view.sessions.length === 0 ? (
				<p className="m-0 px-region py-panel text-body text-muted-foreground">
					No voice session has captured context yet.
				</p>
			) : (
				view.sessions.map((session) => (
					<VoiceContextSessionRegion
						key={session.key}
						onCollapseBody={collapseBody}
						onCollapseBrief={collapseBrief}
						onCollapseEntries={collapseEntries}
						onCopy={copy}
						onNextBody={nextBody}
						onNextBrief={nextBrief}
						onNextEntries={nextEntries}
						onPreviousBody={previousBody}
						onPreviousBrief={previousBrief}
						onPreviousEntries={previousEntries}
						session={session}
					/>
				))
			)}
		</section>
	);
}
