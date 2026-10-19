// What one row of work opens to: the command's directory, exit code and the
// tail of its output; the files a change touched with the lines it added and
// removed; a tool call's arguments and error; a reasoning summary in full.
// Everything here is exactly what the server published, bounded by the server.

import type { JSX } from "react";

import { reasoningParts } from "#ui/rules/thread/activity-words.ts";
import type { ActivityItem } from "#ui/rules/runtime/messages.ts";

/** Inputs for the evidence of one row. */
interface ActivityEvidenceProps {
	readonly item: ActivityItem;
}

/**
 * What one row of work opens to.
 * @param props The item.
 * @returns The evidence, or nothing for an item that has none beyond its row.
 */
function ActivityEvidence(props: ActivityEvidenceProps): JSX.Element | null {
	const { item } = props;
	switch (item.media) {
		case "command":
			return <CommandEvidence item={item} />;
		case "fileChange":
			return <FileEvidence item={item} />;
		case "tool":
			return <ToolEvidence item={item} />;
		case "reasoning":
			return (
				<p className="text-body text-muted-foreground whitespace-pre-wrap">
					{reasoningParts(item.text).body}
				</p>
			);
		default:
			return null;
	}
}

/**
 * A command's directory, exit code and output tail.
 * @param props The command.
 * @param props.item The command item.
 * @returns The evidence.
 */
function CommandEvidence(props: {
	readonly item: Extract<ActivityItem, { readonly media: "command" }>;
}): JSX.Element {
	const { item } = props;
	return (
		<div className="flex flex-col gap-1.5">
			<p className="text-technical text-muted-foreground flex flex-wrap gap-x-3 font-mono">
				{item.cwd !== null && <span className="break-all">in {item.cwd}</span>}
				{item.exitCode !== null && (
					<span className={item.exitCode === 0 ? "" : "text-destructive"}>
						exit {item.exitCode}
					</span>
				)}
			</p>
			{item.output !== null && (
				<pre className="bg-muted/70 text-technical rounded-control max-h-60 overflow-auto px-2.5 py-2 font-mono leading-[15px] break-all whitespace-pre-wrap">
					{item.outputTruncated && <span className="text-muted-foreground">…{"\n"}</span>}
					{item.output}
				</pre>
			)}
		</div>
	);
}

/** What each kind of change is called. */
const CHANGE_WORDS = { add: "added", delete: "deleted", update: "edited" } as const;

/**
 * The files one change touched.
 * @param props The change.
 * @param props.item The file change item.
 * @returns The list.
 */
function FileEvidence(props: {
	readonly item: Extract<ActivityItem, { readonly media: "fileChange" }>;
}): JSX.Element {
	const { item } = props;
	return (
		<ul className="flex flex-col gap-0.5">
			{item.changes.map((change) => (
				<li
					key={change.path}
					className="text-technical flex min-w-0 items-baseline gap-2 font-mono"
				>
					<span className="text-muted-foreground w-12 shrink-0">{CHANGE_WORDS[change.kind]}</span>
					<span className="min-w-0 flex-1 truncate" title={change.movePath ?? change.path}>
						{change.path}
						{change.movePath !== null && ` → ${change.movePath}`}
					</span>
					<LineCounts added={change.added} removed={change.removed} />
				</li>
			))}
			{item.changesTruncated && (
				<li className="text-technical text-muted-foreground font-mono">and more…</li>
			)}
		</ul>
	);
}

/**
 * Lines added and removed, in the comparison colours.
 * @param props The counts.
 * @param props.added Lines added.
 * @param props.removed Lines removed.
 * @returns The counts.
 */
function LineCounts(props: { readonly added: number; readonly removed: number }): JSX.Element {
	return (
		<span className="text-technical shrink-0 font-mono">
			<span className="text-(--standing-added)">+{props.added}</span>{" "}
			<span className="text-(--standing-removed)">−{props.removed}</span>
		</span>
	);
}

/**
 * A tool call's arguments and error.
 * @param props The call.
 * @param props.item The tool item.
 * @returns The evidence.
 */
function ToolEvidence(props: {
	readonly item: Extract<ActivityItem, { readonly media: "tool" }>;
}): JSX.Element {
	const { item } = props;
	return (
		<div className="flex flex-col gap-1.5">
			{item.arguments !== null && (
				<pre className="bg-muted/70 text-technical rounded-control max-h-40 overflow-auto px-2.5 py-2 font-mono leading-[15px] break-all whitespace-pre-wrap">
					{item.arguments}
				</pre>
			)}
			{item.error !== null && <p className="text-body text-destructive">{item.error}</p>}
		</div>
	);
}

export { ActivityEvidence, LineCounts };
