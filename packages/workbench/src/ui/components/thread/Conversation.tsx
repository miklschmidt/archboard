// The conversation: every turn in order, each rendered from its parts — the
// person's prompts, the plan's progress, runs of work opening to their
// evidence, the agent's prose in markdown, approvals, and how the turn ended —
// followed by what the conversation does not hold yet (messages still on their
// way, queued prompts, decisions waiting on the person). The voice
// coordinator's turns stand among the agent's, named and ruled at the left. It
// stays pinned to the newest line while the reader is at the bottom and offers
// a way back down when they have scrolled up.

import {
	type DataMessagePartProps,
	MessagePrimitive,
	ThreadPrimitive,
	useAuiState,
} from "@assistant-ui/react";
import { RiArrowDownLine } from "@remixicon/react";
import type { JSX, ReactNode } from "react";

import type { ConversationDataParts } from "#ui/rules/runtime/messages.ts";
import { ActivityRun } from "#ui/components/thread/ActivityRun.tsx";
import {
	ApprovalMark,
	PlanNote,
	PlanProgress,
	PromptBlock,
	TurnEndLine,
} from "#ui/components/thread/TurnParts.tsx";
import { AnswerText } from "#ui/components/thread/AnswerText.tsx";
import { VOICE_TURN, VoiceTurnHead, voiceTurnOf } from "#ui/components/thread/VoiceTurn.tsx";

/**
 * What a data part carries, as the seam that made it named it.
 *
 * The vendor types a data part's payload as `any`; the one place that makes
 * these parts (`toThreadMessageLike`) gives each name exactly one shape, and
 * the part renderer is looked up by that same name, so the payload is the
 * name's shape by construction.
 * @param props The part.
 * @param name The name it was drawn under.
 * @returns The payload.
 */
function partData<Name extends keyof ConversationDataParts>(
	props: DataMessagePartProps,
	name: Name,
): ConversationDataParts[Name] {
	if (props.name !== name) throw new Error(`A ${props.name} part was drawn as ${name}.`);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the seam in `toThreadMessageLike` gives each part name exactly one payload shape.
	return props.data as ConversationDataParts[Name];
}

/**
 * The person's prompt.
 * @param props The part.
 * @returns The prompt.
 */
function PromptPart(props: DataMessagePartProps): JSX.Element {
	return <PromptBlock item={partData(props, "prompt")} />;
}

/**
 * A run of work.
 * @param props The part.
 * @returns The run.
 */
function ActivityPart(props: DataMessagePartProps): JSX.Element {
	return <ActivityRun run={partData(props, "activity")} />;
}

/**
 * The plan's progress.
 * @param props The part.
 * @returns The plan.
 */
function PlanProgressPart(props: DataMessagePartProps): JSX.Element {
	return <PlanProgress plan={partData(props, "plan-progress")} />;
}

/**
 * A plan the agent wrote out.
 * @param props The part.
 * @returns The note.
 */
function PlanPart(props: DataMessagePartProps): JSX.Element {
	return <PlanNote item={partData(props, "plan")} />;
}

/**
 * Where an approval stands.
 * @param props The part.
 * @returns The mark.
 */
function ApprovalPart(props: DataMessagePartProps): JSX.Element {
	return <ApprovalMark item={partData(props, "approval")} />;
}

/**
 * How the turn ended.
 * @param props The part.
 * @returns The line.
 */
function TurnEndPart(props: DataMessagePartProps): JSX.Element | null {
	return <TurnEndLine end={partData(props, "turn-end")} />;
}

/** Every part the conversation renders, by kind and name. */
const PART_COMPONENTS = {
	Text: AnswerText,
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
 * One turn: the workhorse's, or the voice coordinator's, which is named and
 * ruled at the left, and found by its id from the prompt it delegated.
 * @returns The turn.
 */
function AgentTurn(): JSX.Element {
	const voiceTurn = useAuiState((state) => voiceTurnOf(state.message.metadata.custom));
	const voice = voiceTurn !== null;
	return (
		<MessagePrimitive.Root
			data-slot="turn"
			data-owner={voice ? "coordinator" : "workhorse"}
			data-voice-turn={voiceTurn ?? undefined}
			className={`flex flex-col gap-2.5 text-[13.5px] leading-[21px] ${voice ? VOICE_TURN : ""}`}
		>
			{voice && <VoiceTurnHead />}
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
	/** What follows the last turn: what the conversation does not hold yet, or its empty state. */
	readonly children: ReactNode;
}

/**
 * The conversation.
 * @param props What follows the last turn.
 * @returns The scrolling conversation.
 */
function Conversation(props: ConversationProps): JSX.Element {
	return (
		<ThreadPrimitive.Root
			data-slot="conversation"
			className="relative flex min-h-0 flex-1 flex-col"
		>
			<ThreadPrimitive.Viewport className="flex min-h-0 flex-1 [scrollbar-gutter:stable] flex-col overflow-y-auto">
				<div className="flex flex-1 flex-col gap-7 px-5 pt-4 pb-5">
					<ThreadPrimitive.Messages>{renderTurn}</ThreadPrimitive.Messages>
					{props.children}
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
