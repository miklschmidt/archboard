// Every sentence the composer says, in one place: its own refusals, the
// transport's refusals in the composer's words, and the outcome messages.

import type { DeliveryOutcome } from "@/shared/codex-browser-model";
import type {
	WorkbenchComposerAction,
	WorkbenchComposerRefusalCode,
} from "@/ui/workbench-composer/lib/contract";

/** The largest prompt the closed `boundedText(16_384)` body accepts. */
const MAX_PROMPT_BYTES = 16_384;

const REFUSAL_RECOVERIES: Readonly<Record<WorkbenchComposerRefusalCode, string>> = {
	unavailable: "Wait for Codex to become thread-capable, then send the message again.",
	unbound: "Create or attach a Codex workhorse for this pane, then send a message.",
	inspect_only: "Select a current executable workhorse before sending a message.",
	empty_prompt: "Type a message before sending.",
	prompt_too_long: `Shorten the message to at most ${String(MAX_PROMPT_BYTES)} UTF-8 bytes.`,
	prompt_invalid: "Remove the unsupported character, then send the message again.",
	ambiguous_turn: "Wait for Codex to publish one authoritative in-progress turn, then try again.",
	no_active_turn: "There is nothing to steer or interrupt; the workhorse is idle.",
	turn_changed: "Read the current turn, then interrupt that one.",
	command_pending: "Wait for the command already in flight to settle.",
};

const REFUSAL_MESSAGES: Readonly<Record<WorkbenchComposerRefusalCode, string>> = {
	unavailable: "The Codex workbench cannot accept direct workhorse input.",
	unbound: "This pane has no Codex workhorse to send to.",
	inspect_only: "This pane's thread link is inspect-only, so it accepts no direct input.",
	empty_prompt: "The workhorse accepts a non-empty message only.",
	prompt_too_long: "The message is longer than the workbench accepts.",
	prompt_invalid: "The message contains a character the workbench contract refuses.",
	ambiguous_turn: "Codex is reporting more than one in-progress turn, so no turn is authoritative.",
	no_active_turn: "The workhorse has no in-progress turn.",
	turn_changed: "The in-progress turn changed after this interrupt was offered.",
	command_pending: "Another workbench command is already in flight from this composer.",
};

/**
 * The transport's refusal codes, said in human words. Kept beside the composer
 * rather than shared, because each surface explains the same refusal in terms
 * of the action the person just took. `invalid_command` is the host refusing a
 * command that does not fit the workhorse's current state; the reachable case
 * is the authoritative in-progress guard on `turn/start`.
 */
const TRANSPORT_REFUSALS: Readonly<Record<string, string>> = {
	link_changed: "The pane moved to another thread link after this message was composed.",
	link_required: "The command did not name the workbench target it was composed against.",
	lease_required: "This browser does not hold the workbench command lease.",
	lease_expired: "The workbench command lease expired before the command was sent.",
	lease_released: "The workbench command lease was released before the command was sent.",
	not_ready: "The workbench cannot send workhorse commands in its current state.",
	socket_unavailable: "The workbench lost its connection before the command was sent.",
	incompatible_contract: "The host answered with a workbench contract this browser cannot read.",
	response_lost: "The host never answered, so the command's outcome is unknown.",
	replaced: "Another workbench connection replaced this one before the command was sent.",
	invalid_command:
		"The host refused this command for the workhorse's current state. Read the timeline, then send again.",
	gateway_error: "The host refused this command.",
};

const GENERIC_TRANSPORT_REFUSAL = "The host refused this workhorse command.";

/**
 * A transport refusal code in the composer's words.
 * @param code The refusal code.
 * @returns The sentence.
 */
function transportRefusalMessage(code: string): string {
	return TRANSPORT_REFUSALS[code] ?? GENERIC_TRANSPORT_REFUSAL;
}

const OUTCOME_MESSAGES: Readonly<Record<DeliveryOutcome, string>> = {
	delivered: "Codex accepted the message and published its authoritative turn.",
	not_delivered: "The host delivered nothing, so the workhorse never saw this message.",
	outcome_unknown:
		"The host lost the answer, so the outcome is unknown. Archboard never retries an unknown mutation.",
};

const QUEUED_MESSAGE = "Codex parked the message in the thread queue.";

const OUTCOME_RECOVERIES: Readonly<Record<DeliveryOutcome, string | null>> = {
	delivered: null,
	not_delivered: "The draft was kept in the composer. Correct the problem and send it again.",
	outcome_unknown:
		"Read the workhorse timeline before deciding whether to send this message again. The text is kept below.",
};

const PENDING_MESSAGES: Readonly<Record<WorkbenchComposerAction, string>> = {
	start: "Sending your message to the Codex workhorse.",
	steer: "Steering the current Codex turn.",
	interrupt: "Interrupting the current Codex turn.",
	queue: "Queueing your message for the Codex workhorse.",
};

const LATE_RESULT_REASON =
	"The pane moved to another thread link before the host answered, so this result is not applied here.";

export {
	GENERIC_TRANSPORT_REFUSAL,
	LATE_RESULT_REASON,
	MAX_PROMPT_BYTES,
	OUTCOME_MESSAGES,
	OUTCOME_RECOVERIES,
	PENDING_MESSAGES,
	QUEUED_MESSAGE,
	REFUSAL_MESSAGES,
	REFUSAL_RECOVERIES,
	TRANSPORT_REFUSALS,
	transportRefusalMessage,
};
