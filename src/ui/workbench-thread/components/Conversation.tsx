// The conversation: every turn in order, each rendered from its parts — the
// person's prompts, the plan's progress, runs of work opening to their
// evidence, the agent's prose in markdown, approvals, and how the turn ended —
// followed by what the conversation does not hold yet (messages still on their
// way, queued prompts, decisions waiting on the person). It stays pinned to the
// newest line while the reader is at the bottom and offers a way back down
// when they have scrolled up.

import {
	type DataMessagePartProps,
	MessagePrimitive,
	ThreadPrimitive,
} from "@assistant-ui/react";
import { RiArrowDownLine } from "@remixicon/react";
import type { JSX, ReactNode } from "react";

import type { ConversationDataParts } from "@/ui/workbench-runtime";
import { ActivityRun } from "@/ui/workbench-thread/components/ActivityRun";
import {
	ApprovalMark,
	PlanNote,
	PlanProgress,
	PromptBlock,
	TurnEndLine,
} from "@/ui/workbench-thread/components/TurnParts";
import { MarkdownText } from "@/ui/workbench-thread/markdown-text";

/**
 * What a data part carries, as the seam that made it named it.
 *
 * The vendor types a data part's payload as `any`; the one place that makes
 * these parts (`toThreadMessageLike`) gives each name exactly one shape, and
 * the part renderer is looked up by that same name, so the payload is the
 * name's shape by construction.
 * @param props The part.
 * @returns The payload.
 */
function partData<Name extends keyof ConversationDataParts>(
	props: DataMessagePartProps,
): ConversationDataParts[Name] {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unsafe-return -- the seam in `toThreadMessageLike` gives each part name exactly one payload shape.
	return props.data as ConversationDataParts[Name];
}

/**
 * The person's prompt.
 * @param props The part.
 * @returns The prompt.
 */
function PromptPart(props: DataMessagePartProps): JSX.Element {
	return <PromptBlock item={partData<"prompt">(props)} />;
}

/**
 * A run of work.
 * @param props The part.
 * @returns The run.
 */
function ActivityPart(props: DataMessagePartProps): JSX.Element {
	return <ActivityRun run={partData<"activity">(props)} />;
}

/**
 * The plan's progress.
 * @param props The part.
 * @returns The plan.
 */
function PlanProgressPart(props: DataMessagePartProps): JSX.Element {
	return <PlanProgress plan={partData<"plan-progress">(props)} />;
}

/**
 * A plan the agent wrote out.
 * @param props The part.
 * @returns The note.
 */
function PlanPart(props: DataMessagePartProps): JSX.Element {
	return <PlanNote item={partData<"plan">(props)} />;
}

/**
 * Where an approval stands.
 * @param props The part.
 * @returns The mark.
 */
function ApprovalPart(props: DataMessagePartProps): JSX.Element {
	return <ApprovalMark item={partData<"approval">(props)} />;
}

/**
 * How the turn ended.
 * @param props The part.
 * @returns The line.
 */
function TurnEndPart(props: DataMessagePartProps): JSX.Element | null {
	return <TurnEndLine end={partData<"turn-end">(props)} />;
}

/** Every part the conversation renders, by kind and name. */
const PART_COMPONENTS = {
	Text: MarkdownText,
	data: {
		by_name: {
			prompt: PromptPart,
			activity: ActivityPart,
			"plan-progress": PlanProgressPart,
			plan: PlanPart,
			approval: ApprovalPart,
			"turn-end": TurnEndPart,
		},
	},
} as const satisfies Parameters<typeof MessagePrimitive.Parts>[0]["components"];

/**
 * One turn.
 * @returns The turn.
 */
function AgentTurn(): JSX.Element {
	return (
		<MessagePrimitive.Root data-slot="turn" className="flex flex-col gap-2.5">
			<MessagePrimitive.Parts components={PART_COMPONENTS} />
		</MessagePrimitive.Root>
	);
}

/**
 * The conversation's one turn component.
 * @returns The turn.
 */
function renderTurn(): JSX.Element {
	return <AgentTurn />;
}

/** Inputs for the conversation. */
interface ConversationProps {
	/** Shown instead of turns while there are none and nothing is on its way. */
	readonly empty: ReactNode;
	/** What the conversation does not hold yet, after its last turn. */
	readonly footer: ReactNode;
}

/**
 * The conversation.
 * @param props The empty state and the footer.
 * @returns The scrolling conversation.
 */
function Conversation(props: ConversationProps): JSX.Element {
	return (
		<ThreadPrimitive.Root data-slot="conversation" className="relative flex min-h-0 flex-1 flex-col">
			<ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
				<div className="flex flex-1 flex-col gap-7 px-5 pt-4 pb-5">
					{props.empty}
					<ThreadPrimitive.Messages>{renderTurn}</ThreadPrimitive.Messages>
					{props.footer}
				</div>
				<ThreadPrimitive.ScrollToBottom
					aria-label="Jump to the newest"
					className="border-border bg-background text-foreground hover:bg-muted sticky bottom-3 mx-auto flex size-7 shrink-0 items-center justify-center rounded-full border disabled:invisible"
				>
					<RiArrowDownLine aria-hidden="true" className="size-3.5" />
				</ThreadPrimitive.ScrollToBottom>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
}

export { Conversation, type ConversationProps };
