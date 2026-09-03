import type { ReactNode } from "react";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import { cn } from "../../ui-classnames/index.js";
import {
	boundedDetails,
	boundedText,
	record,
	safeHttpUrl,
	stringList,
	textField,
} from "./details.js";
import type { TimelineItem, TimelineTurn } from "./normalize.js";
import { stableBoundedKey } from "./stable-key.js";

type BrowserItem = BrowserTimeline["turns"][number]["items"][number];
type CanonicalItemStatus = Extract<
	Extract<BrowserItem, { readonly status: unknown }>["status"],
	string
>;

const STATUS_TONES = {
	inProgress: "text-status-foreground",
	pending: "text-status-foreground",
	completed: "text-muted-foreground",
	resolved: "text-muted-foreground",
	failed: "text-destructive",
	declined: "text-warning",
	cancelled: "text-warning",
} as const satisfies Readonly<Record<CanonicalItemStatus, string>>;
const UNKNOWN_STATUS_TONE = "text-muted-foreground";
const VISIBLE_ENTRY_LIMIT = 32;

type SourceKind = "prose" | "technical";

interface SourcePresentation {
	readonly value: string;
	readonly kind: SourceKind;
}

const SOURCE_KIND_CLASSES = {
	prose: "font-sans text-body break-words",
	technical: "font-mono text-technical break-all",
} as const satisfies Readonly<Record<SourceKind, string>>;

interface BoundedEntries<Value> {
	readonly visible: readonly Value[];
	readonly omitted: number;
}

function boundedEntries<Value>(values: readonly Value[]): BoundedEntries<Value> {
	return {
		visible: values.slice(0, VISIBLE_ENTRY_LIMIT),
		omitted: Math.max(0, values.length - VISIBLE_ENTRY_LIMIT),
	};
}

function numberField(value: unknown, key: string): number | null {
	const field = record(value)?.[key];
	return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function statusFor(value: unknown): string | null {
	const status = record(value)?.status;
	return typeof status === "string" && status.length > 0 ? status : null;
}

function isCanonicalStatus(value: string): value is CanonicalItemStatus {
	return Object.hasOwn(STATUS_TONES, value);
}

function keyedValues<Value>(
	values: readonly Value[],
): readonly { readonly key: string; readonly value: Value }[] {
	const occurrences = new Map<string, number>();
	return values.map((value) => {
		const base = stableBoundedKey(value);
		const occurrence = occurrences.get(base) ?? 0;
		occurrences.set(base, occurrence + 1);
		return { key: occurrence === 0 ? base : `${base}:${occurrence}`, value };
	});
}

function sourcePresentation(value: string, kind: SourceKind): SourcePresentation | null {
	return value.length === 0 ? null : { value, kind };
}

function namedSource(value: unknown): SourcePresentation | null {
	const item = record(value);
	if (!item) return null;
	switch (item.type) {
		case "commandExecution":
			return sourcePresentation(textField(item, "command"), "technical");
		case "fileChange": {
			const count = Array.isArray(item.changes) ? item.changes.length : 0;
			return sourcePresentation(`${count} ${count === 1 ? "file" : "files"}`, "prose");
		}
		case "mcpToolCall":
			return sourcePresentation(
				[textField(item, "server"), textField(item, "tool")].filter(Boolean).join(" / "),
				"technical",
			);
		case "dynamicToolCall":
			return sourcePresentation(
				[textField(item, "namespace"), textField(item, "tool")].filter(Boolean).join(" / "),
				"technical",
			);
		case "collabAgentToolCall":
			return sourcePresentation(textField(item, "tool"), "technical");
		case "subAgentActivity":
			return sourcePresentation(
				[textField(item, "kind"), textField(item, "agentPath")].filter(Boolean).join(" · "),
				"technical",
			);
		case "webSearch":
			return sourcePresentation(textField(item, "query"), "prose");
		case "imageView":
			return sourcePresentation(textField(item, "path"), "technical");
		case "imageGeneration":
			return sourcePresentation(
				textField(item, "savedPath") || textField(item, "result"),
				"technical",
			);
		case "functionCallOutput":
			return sourcePresentation(
				[textField(item, "namespace"), textField(item, "name")].filter(Boolean).join(" / "),
				"technical",
			);
		case "sleep": {
			const duration = numberField(item, "durationMs");
			return sourcePresentation(duration === null ? "" : `${duration} ms`, "technical");
		}
		case "approval":
			return sourcePresentation(textField(item, "approvalId"), "technical");
		default:
			return null;
	}
}

function userContent(value: unknown): BoundedEntries<ReactNode> {
	const content = record(value)?.content;
	if (!Array.isArray(content)) return boundedEntries([]);
	const bounded = boundedEntries(content);
	return {
		omitted: bounded.omitted,
		visible: keyedValues(bounded.visible).map(({ key, value: part }) => {
			const entry = record(part);
			const type = textField(entry, "type") || "unknown";
			if (type === "text") {
				return <BoundedCopy key={key} value={textField(entry, "text")} />;
			}
			const source = textField(entry, "url") || textField(entry, "path");
			return (
				<p className="m-0 text-body text-muted-foreground" key={key}>
					<span className="font-medium text-foreground">{type}</span>
					{source.length > 0 ? (
						<>
							{" "}
							· <SafeSource kind="technical" value={source} />
						</>
					) : null}
				</p>
			);
		}),
	};
}

function textSections(value: unknown): BoundedEntries<string> {
	const item = record(value);
	if (!item) return boundedEntries([]);
	switch (item.type) {
		case "userMessage":
			return boundedEntries([]);
		case "hookPrompt": {
			const fragments = boundedEntries(Array.isArray(item.fragments) ? item.fragments : []);
			return {
				visible: fragments.visible.map((fragment) => textField(fragment, "text")).filter(Boolean),
				omitted: fragments.omitted,
			};
		}
		case "agentMessage":
		case "plan":
			return boundedEntries([textField(item, "text")].filter(Boolean));
		case "reasoning":
			return boundedEntries([...stringList(item.summary), ...stringList(item.content)]);
		case "commandExecution":
			return boundedEntries([textField(item, "aggregatedOutput")].filter(Boolean));
		case "fileChange": {
			const changes = boundedEntries(Array.isArray(item.changes) ? item.changes : []);
			return {
				visible: changes.visible.flatMap((change) => {
					const path = textField(change, "path");
					const diff = textField(change, "diff");
					return [path, diff].filter(Boolean);
				}),
				omitted: changes.omitted,
			};
		}
		case "mcpToolCall":
			return boundedEntries([textField(item.error, "message")].filter(Boolean));
		case "collabAgentToolCall":
			return boundedEntries([textField(item, "prompt")].filter(Boolean));
		case "enteredReviewMode":
		case "exitedReviewMode":
			return boundedEntries([textField(item, "review")].filter(Boolean));
		case "imageGeneration":
			return boundedEntries([textField(item, "revisedPrompt")].filter(Boolean));
		default:
			return boundedEntries([]);
	}
}

function itemLinks(value: unknown): readonly string[] {
	const item = record(value);
	if (!item) return [];
	if (item.type === "webSearch") {
		const link = safeHttpUrl(record(item.action)?.url);
		return link === null ? [] : [link];
	}
	if (item.type === "imageGeneration") {
		const link = safeHttpUrl(item.result);
		return link === null ? [] : [link];
	}
	return [];
}

function SafeSource({ value, kind }: SourcePresentation) {
	const bounded = boundedText(value, 2_048).text;
	const url = safeHttpUrl(value);
	return url === null ? (
		<span className={SOURCE_KIND_CLASSES[kind]}>{bounded || "Unavailable source"}</span>
	) : (
		<a
			className={cn(
				"inline-flex min-h-touch-target max-w-full items-center text-primary underline underline-offset-2 focus-visible:rounded-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				SOURCE_KIND_CLASSES[kind],
			)}
			href={url}
			rel="noreferrer noopener"
			target="_blank"
		>
			{bounded}
		</a>
	);
}

function BoundedCopy({ value }: { readonly value: unknown }) {
	const bounded = boundedText(value);
	if (bounded.text.length === 0) return null;
	return (
		<pre className="m-0 max-w-full overflow-x-auto font-sans text-body break-words whitespace-pre-wrap text-foreground">
			{bounded.text}
			{bounded.omitted > 0 ? (
				<span className="block text-muted-foreground">[{bounded.omitted} characters omitted]</span>
			) : null}
		</pre>
	);
}

function OmittedEntries({ count }: { readonly count: number }) {
	if (count === 0) return null;
	return (
		<p className="m-0 text-body text-muted-foreground" data-omitted-entries={count}>
			{count} {count === 1 ? "entry" : "entries"} omitted
		</p>
	);
}

function RawDetails({ value }: { readonly value: unknown }) {
	const details = boundedDetails(value);
	return (
		<details className="mt-control border-t border-border-subtle pt-compact text-body">
			<summary className="flex min-h-touch-target cursor-pointer items-center text-muted-foreground focus-visible:rounded-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
				Raw details
			</summary>
			<pre className="m-0 max-h-80 overflow-auto font-mono text-technical break-all whitespace-pre-wrap text-muted-foreground">
				{details.text}
				{details.omitted > 0 ? `\n[${details.omitted} characters omitted]` : ""}
			</pre>
		</details>
	);
}

export function RenderTimelineItem({ item }: { readonly item: TimelineItem }) {
	const status = statusFor(item.value);
	const source = namedSource(item.value);
	const sections = textSections(item.value);
	const links = boundedEntries(itemLinks(item.value));
	const user =
		record(item.value)?.type === "userMessage" ? userContent(item.value) : boundedEntries([]);
	return (
		<article
			className="border-b border-border-subtle py-control font-sans last:border-b-0"
			aria-label={item.label}
			data-item-id={item.itemId}
			data-item-key={item.identity}
			data-item-type={item.type}
		>
			<header className="min-w-0 mb-compact flex items-baseline justify-between gap-control">
				<h3 className="m-0 text-kicker font-semibold text-muted-foreground">{item.label}</h3>
				<span
					className="min-w-0 truncate font-mono text-technical text-faint-foreground"
					title={item.itemId}
				>
					{item.itemId}
				</span>
			</header>
			{status ? (
				<p
					className={cn(
						"m-0 !text-body",
						isCanonicalStatus(status) ? STATUS_TONES[status] : UNKNOWN_STATUS_TONE,
					)}
				>
					{status}
				</p>
			) : null}
			{source === null ? null : <SafeSource {...source} />}
			<div className="mt-compact grid gap-compact">
				{user.visible}
				<OmittedEntries count={user.omitted} />
				{keyedValues(sections.visible).map(({ key, value }) => (
					<BoundedCopy key={key} value={value} />
				))}
				<OmittedEntries count={sections.omitted} />
				{keyedValues(links.visible).map(({ key, value }) => (
					<SafeSource key={key} kind="technical" value={value} />
				))}
				<OmittedEntries count={links.omitted} />
				{item.malformed ? (
					<p className="m-0 text-body text-warning">
						This item is malformed or uses an unknown Codex variant. Its bounded details remain
						available.
					</p>
				) : null}
			</div>
			<RawDetails value={item.value} />
		</article>
	);
}

export function TurnTerminalState({ turn }: { readonly turn: TimelineTurn }) {
	if (turn.streaming || turn.status === "completed") return null;
	const interrupted = turn.status === "interrupted";
	const label = interrupted ? "Turn interrupted" : "Turn failed";
	return (
		<section
			className={cn(
				"border-b border-border-subtle py-control font-sans !text-body",
				interrupted ? "text-warning" : "text-destructive",
			)}
			role={interrupted ? "status" : "alert"}
			data-turn-outcome={turn.status}
		>
			<p className="m-0 font-medium">{label}</p>
			{turn.error === null || turn.error === undefined ? null : <RawDetails value={turn.error} />}
		</section>
	);
}
