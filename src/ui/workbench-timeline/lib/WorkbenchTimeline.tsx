import { createElement, useId, useMemo, type ReactNode } from "react";

import { cn } from "../../ui-classnames/index.js";
import type { WorkbenchTimelineProps } from "../contract.js";
import { assistantTimelinePrimitives } from "../timeline.js";
import { record, textField } from "./details.js";
import { TimelineMessageList } from "./message-list.js";
import { normalizeTimeline, type TimelineItem, type TimelineTurn } from "./normalize.js";
import { RenderTimelineItem, TurnTerminalState } from "./render-item.js";

const { MessagePartPrimitive, MessagePrimitive, ThreadPrimitive } = assistantTimelinePrimitives;

function fallbackIdentity(type: string, itemId: unknown): string {
	return typeof itemId === "string" && itemId.length > 0 ? itemId : `runtime-${type}`;
}

function RuntimeTextPart(props: { readonly text: string; readonly itemId?: string }): ReactNode {
	return createElement(
		"article",
		{
			className: "border-b border-border-subtle py-control font-sans last:border-b-0",
			"aria-label": "Assistant message",
			"data-item-id": fallbackIdentity("text", props.itemId),
			"data-item-type": "agentMessage",
		},
		createElement(
			"h3",
			{ className: "m-0 mb-compact text-kicker font-semibold text-muted-foreground" },
			"Assistant message",
		),
		createElement(MessagePartPrimitive.Text, {
			className: "whitespace-pre-wrap font-sans text-body break-words text-foreground",
			component: "p",
			smooth: false,
		}),
	);
}

function RuntimeReasoningPart(props: {
	readonly text: string;
	readonly itemId?: string;
}): ReactNode {
	const identity = fallbackIdentity("reasoning", props.itemId);
	const item: TimelineItem = {
		identity,
		itemId: identity,
		label: "Reasoning",
		type: "reasoning",
		value: { type: "reasoning", id: identity, summary: [props.text], content: [] },
		malformed: false,
	};
	return createElement(RenderTimelineItem, { item });
}

function dataItem(name: string, data: unknown): TimelineItem {
	const value = record(data) ?? { value: data };
	const itemId = textField(value, "itemId") || `runtime-${name}`;
	const media = textField(value, "media");
	const mappedType =
		media === "plan"
			? "plan"
			: media === "command"
				? "commandExecution"
				: media === "fileChange"
					? "fileChange"
					: media === "approval"
						? "approval"
						: media === "tool"
							? "dynamicToolCall"
							: "unknown";
	const labels: Readonly<Record<string, string>> = {
		plan: "Plan",
		commandExecution: "Command",
		fileChange: "File change",
		approval: "Approval",
		dynamicToolCall: "Tool call",
		unknown: "Unknown item",
	};
	return {
		identity: itemId,
		itemId,
		label: labels[mappedType] ?? "Unknown item",
		type: mappedType,
		value: { ...value, type: mappedType, id: itemId },
		malformed: mappedType === "unknown",
	};
}

function RuntimeDataPart(props: { readonly name: string; readonly data: unknown }): ReactNode {
	return createElement(RenderTimelineItem, { item: dataItem(props.name, props.data) });
}

const PART_RENDERERS = {
	Text: RuntimeTextPart,
	Reasoning: RuntimeReasoningPart,
	data: { Fallback: RuntimeDataPart },
};

function renderTurn(turn: TimelineTurn | undefined, messageId: string): ReactNode {
	return createElement(
		MessagePrimitive.Root,
		{
			className: "border-b border-border bg-surface px-region last:border-b-0",
		},
		createElement(
			"div",
			{ "data-turn-id": messageId, "data-turn-status": turn?.status ?? "runtime" },
			createElement(
				"header",
				{
					className:
						"flex min-h-touch-target items-center justify-between gap-control border-b border-border-subtle font-sans",
				},
				createElement(
					"h2",
					{ className: "m-0 text-kicker font-semibold text-muted-foreground" },
					"Codex turn",
				),
				createElement(
					"span",
					{
						className: "min-w-0 truncate font-mono text-technical text-faint-foreground",
						title: messageId,
					},
					messageId,
				),
			),
			turn === undefined
				? createElement(MessagePrimitive.Parts, { components: PART_RENDERERS })
				: createElement(
						"div",
						{ "data-turn-items": turn.items.length },
						...turn.items.map((item) =>
							createElement(RenderTimelineItem, { item, key: item.identity }),
						),
						createElement(TurnTerminalState, { turn }),
						turn.streaming && turn.items.length === 0
							? createElement(
									"p",
									{ className: "m-0 py-control font-sans text-body text-status-foreground" },
									"Codex is working. New items will appear here.",
								)
							: null,
					),
		),
	);
}

export function WorkbenchTimeline(props: WorkbenchTimelineProps): ReactNode {
	const headingId = useId();
	const normalized = useMemo(() => normalizeTimeline(props), [props]);
	const label = props.label ?? "Codex workbench activity";
	return createElement(
		ThreadPrimitive.Root,
		{ className: cn("min-h-0 min-w-0 bg-surface text-foreground", props.className) },
		createElement(
			"section",
			{
				"data-history": normalized.priorEpoch ? "prior_epoch" : "current",
				"data-thread-id": props.threadId,
			},
			createElement(
				"header",
				{
					className:
						"flex min-h-touch-target items-center justify-between gap-control border-b border-border px-region font-sans",
				},
				createElement("h1", { className: "m-0 text-title font-semibold", id: headingId }, label),
				createElement(
					"span",
					{
						className: normalized.priorEpoch
							? "text-body text-warning"
							: "text-body text-muted-foreground",
					},
					normalized.priorEpoch ? "Prior session history · read only" : "Current session",
				),
			),
			createElement(
				ThreadPrimitive.ViewportProvider,
				{ options: { turnAnchor: "bottom" } },
				createElement(
					"div",
					{
						className:
							"max-h-full min-h-0 overflow-y-auto bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
						role: "log",
						tabIndex: 0,
						"aria-labelledby": headingId,
						"aria-relevant": "additions",
						"aria-busy": normalized.streaming || undefined,
					},
					createElement(
						ThreadPrimitive.Empty,
						null,
						createElement(
							"p",
							{
								className: "m-0 px-region py-panel font-sans text-body text-muted-foreground",
							},
							"No Codex activity has arrived for this task.",
						),
					),
					createElement(TimelineMessageList, {
						component: ThreadPrimitive.Messages,
						render: (messageId) => renderTurn(normalized.turns.get(messageId), messageId),
					}),
				),
			),
		),
	);
}
