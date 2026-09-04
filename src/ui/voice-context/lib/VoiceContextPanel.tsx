import type React from "react";
import { useCallback, useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import type { VoiceContextClipboardPort, VoiceContextPanelProps } from "../contract.js";
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

function increment(current: ReadonlyMap<string, number>, key: string): ReadonlyMap<string, number> {
	const next = new Map(current);
	next.set(key, (next.get(key) ?? 1) + 1);
	return next;
}

function reset(current: ReadonlyMap<string, number>, key: string): ReadonlyMap<string, number> {
	const next = new Map(current);
	next.delete(key);
	return next;
}

function revealAll(current: ReadonlyMap<string, number>, key: string): ReadonlyMap<string, number> {
	const next = new Map(current);
	next.set(key, Number.MAX_SAFE_INTEGER);
	return next;
}

export function VoiceContextPanel({
	history,
	clipboard = browserClipboard,
	limits,
	className,
}: VoiceContextPanelProps): React.JSX.Element {
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
						if (target.kind === "brief") setBriefPages((current) => revealAll(current, target.key));
						else setEntryBodyPages((current) => revealAll(current, target.key));
						setCopyNotice({
							state: "failure",
							text: "Copy failed. The full exact text is expanded below; select it and copy it manually.",
						});
					},
				);
		},
		[clipboard],
	);
	const collapseSessions = useCallback(() => setSessionPage(1), []);
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
		(key: string) => setEntryBodyPages((current) => increment(current, key)),
		[],
	);
	const nextBrief = useCallback(
		(key: string) => setBriefPages((current) => increment(current, key)),
		[],
	);
	const nextEntries = useCallback(
		(key: string) => setEntryPages((current) => increment(current, key)),
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
				<div className="flex flex-wrap items-center justify-end gap-control">
					{view.sessionPage > 1 && (
						<Button onClick={collapseSessions} tone="quiet">
							Collapse to recent sessions
						</Button>
					)}
					{view.hiddenSessionCount > 0 && (
						<Button onClick={nextSessions} tone="quiet">
							Show next {view.nextSessionCount} earlier sessions. {view.hiddenSessionCount} remain
						</Button>
					)}
				</div>
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
					<VoiceContextSessionRegion
						key={session.key}
						onCollapseBody={collapseBody}
						onCollapseBrief={collapseBrief}
						onCollapseEntries={collapseEntries}
						onCopy={copy}
						onNextBody={nextBody}
						onNextBrief={nextBrief}
						onNextEntries={nextEntries}
						session={session}
					/>
				))
			)}
		</section>
	);
}
