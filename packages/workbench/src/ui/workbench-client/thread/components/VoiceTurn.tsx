// What marks the voice coordinator's work in the conversation: the rule at the
// left of its turns, the head that names it, and the line on a workhorse
// prompt that says the coordinator handed the work over.

import { RiMicLine } from "@remixicon/react";
import { useCallback, type JSX, type MouseEvent } from "react";

import type { ConversationTurn } from "@archboard/codex-realtime-voice/controllers";

/**
 * What sets a turn of the voice coordinator apart: the rule at its left, the rule the
 * said-aloud lines have, and room above it for when a delegated prompt brings it into view.
 */
const VOICE_TURN = "border-status/70 scroll-mt-4 border-l-2 pl-3";

/**
 * Whose turn a message is, as the seam that made the message named it.
 * @param custom The message's custom metadata.
 * @returns The coordinator turn's id, or null for any other turn.
 */
function voiceTurnOf(custom: Readonly<Record<string, unknown>>): string | null {
	const { owner, turnId } = custom;
	return owner === "coordinator" && typeof turnId === "string" ? turnId : null;
}

/**
 * The name above a voice coordinator turn.
 * @returns The head.
 */
function VoiceTurnHead(): JSX.Element {
	return (
		<h3
			data-slot="voice-turn-head"
			className="text-body text-muted-foreground flex items-center gap-1.5"
		>
			<RiMicLine aria-hidden="true" className="size-3.5" />
			<span className="text-foreground font-semibold">Voice coordinator</span>
		</h3>
	);
}

/**
 * Bring a coordinator turn into view.
 * @param from The control that asked, which sits in the conversation.
 * @param turnId The coordinator turn.
 */
function revealVoiceTurn(from: HTMLElement, turnId: string): void {
	const conversation = from.closest('[data-slot="conversation"]');
	const turns = conversation?.querySelectorAll<HTMLElement>("[data-voice-turn]") ?? [];
	[...turns]
		.find((turn) => turn.dataset["voiceTurn"] === turnId)
		?.scrollIntoView({ block: "start" });
}

/**
 * The control that finds a coordinator turn in the conversation.
 * @param props The turn and the words.
 * @param props.turnId The coordinator turn.
 * @param props.children The words.
 * @returns The control.
 */
function RevealVoiceTurn(props: {
	readonly turnId: string;
	readonly children: string;
}): JSX.Element {
	const { turnId } = props;
	const reveal = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => revealVoiceTurn(event.currentTarget, turnId),
		[turnId],
	);
	return (
		<button
			type="button"
			onClick={reveal}
			className="text-primary-text decoration-primary-mark -mx-1 min-h-6 px-1 font-medium underline underline-offset-2 hover:decoration-2"
		>
			{props.children}
		</button>
	);
}

/** Inputs for the delegated line. */
interface DelegatedFromProps {
	readonly delegatedBy: NonNullable<ConversationTurn["delegatedBy"]>;
}

/**
 * Where a workhorse turn came from: the voice coordinator handed it the work.
 * A control that finds that turn while it is in the conversation, otherwise words.
 * @param props The coordinator turn that delegated.
 * @returns The line.
 */
function DelegatedFrom(props: DelegatedFromProps): JSX.Element {
	const { turnId, shown } = props.delegatedBy;
	const words = "Delegated by the voice coordinator";
	return (
		<p
			data-slot="delegated-from"
			className="text-body text-muted-foreground mb-1 flex items-center gap-1.5"
		>
			<RiMicLine aria-hidden="true" className="size-3.5 shrink-0" />
			{shown ? <RevealVoiceTurn turnId={turnId}>{words}</RevealVoiceTurn> : words}
		</p>
	);
}

export { DelegatedFrom, VOICE_TURN, VoiceTurnHead, voiceTurnOf };
