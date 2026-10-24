// What the conversation does not hold yet, at its foot: messages the person
// sent that are still on their way (and what each waits on, or why it was not
// delivered), prompts queued behind the running turn, and decisions the agent
// is waiting on. Newest last, so it sits where the person is reading.

import { RiArrowDownLine, RiArrowUpLine, RiCloseLine, RiSendPlaneLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { BrowserSnapshot } from "@archboard/agent-workbench/contract";
import type { HeldMessage } from "#ui/state/agent-setup/held.ts";
import type { SetupStep } from "#ui/state/agent-setup/setup.ts";
import { ApprovalCard } from "#ui/components/panel/ApprovalCard.tsx";
import { IconAction } from "#ui/components/dock/IconAction.tsx";
import type { AgentActions, AgentView } from "#ui/state/surfaces/contracts.ts";
import { spokenApprovalLine } from "#ui/rules/dock/approval-projection.ts";
import { unsettledApprovals } from "#ui/rules/dock/agent-status.ts";

/** Inputs for the pending work. */
interface PendingWorkProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
}

/**
 * What the conversation does not hold yet.
 * @param props The view and the actions.
 * @returns The pending work, or nothing.
 */
function PendingWork(props: PendingWorkProps): JSX.Element | null {
	const { view, actions } = props;
	const held = view.setup.held;
	const queued = view.snapshot?.queue.entries ?? [];
	const approvals = unsettledApprovals(view);
	if (held.length === 0 && queued.length === 0 && approvals.length === 0) return null;
	return (
		<div data-slot="pending-work" className="flex flex-col gap-3">
			{held.map((message) => (
				<HeldPrompt
					key={message.id}
					message={message}
					step={waitsOn(held, message, view.setup.step)}
					actions={actions}
				/>
			))}
			{queued.map((entry, index) => (
				<QueuedPrompt
					key={entry.submissionId}
					entry={entry}
					first={index === 0}
					last={index === queued.length - 1}
					actions={actions}
				/>
			))}
			<ApprovalCards approvals={approvals} view={view} actions={actions} />
		</div>
	);
}

/**
 * The decisions the agent is waiting on, each answerable aloud while voice is live.
 * @param props The approvals, the view and the actions.
 * @param props.approvals The approvals waiting.
 * @param props.view The agent view.
 * @param props.actions The actions.
 * @returns The cards.
 */
function ApprovalCards(props: {
	readonly approvals: ReturnType<typeof unsettledApprovals>;
	readonly view: AgentView;
	readonly actions: AgentActions;
}): JSX.Element {
	const { view } = props;
	const spoken = ["listening", "speaking", "muted"].includes(view.voice.stage);
	const line = view.snapshot === null ? null : spokenApprovalLine(view.snapshot.spokenApproval);
	return (
		<>
			{line !== null && (
				<p
					data-slot="spoken-approval"
					className={`text-body ${line.warning ? "text-destructive" : "text-muted-foreground"}`}
				>
					{line.text}
				</p>
			)}
			{props.approvals.map((approval) => (
				<ApprovalCardFor
					key={approvalKey(approval)}
					approval={approval}
					view={view}
					spoken={spoken}
					actions={props.actions}
				/>
			))}
		</>
	);
}

/**
 * The key an approval's decision and errors are kept under.
 * @param approval The approval.
 * @returns The key.
 */
function approvalKey(approval: ReturnType<typeof unsettledApprovals>[number]): string {
	return approval.kind === "dynamic_approval" ? approval.identity.callId : approval.requestId;
}

/**
 * One approval's card, with its decision's state.
 * @param props The approval, the view, whether voice may answer, and the actions.
 * @param props.approval The approval.
 * @param props.view The agent view.
 * @param props.spoken Whether voice is live.
 * @param props.actions The actions.
 * @returns The card.
 */
function ApprovalCardFor(props: {
	readonly approval: ReturnType<typeof unsettledApprovals>[number];
	readonly view: AgentView;
	readonly spoken: boolean;
	readonly actions: AgentActions;
}): JSX.Element {
	const { approval, view } = props;
	const key = approvalKey(approval);
	return (
		<ApprovalCard
			approval={approval}
			busy={view.busyApprovals.includes(key)}
			error={view.approvalErrors[key] ?? null}
			spoken={props.spoken}
			actions={props.actions}
		/>
	);
}

/** What a held message waits on: a setup step, or an earlier message that did not arrive. */
type WaitsOn = SetupStep | "earlier";

/** What a held message waits on, in words. */
const WAITS_ON: Readonly<Record<NonNullable<WaitsOn>, string>> = {
	sign_in: "Waiting for you to sign in",
	start: "Waiting for Codex to start",
	link: "Starting a conversation",
	earlier: "Waits for the message above",
};

/**
 * What one held message waits on: messages go in order, so one sent after a
 * message that did not arrive waits for that one; otherwise the setup step.
 * @param held The held messages, oldest first.
 * @param message This one.
 * @param step What the setup waits on.
 * @returns What it waits on.
 */
function waitsOn(held: readonly HeldMessage[], message: HeldMessage, step: SetupStep): WaitsOn {
	const stuck = held.findIndex((other) => other.state === "failed" || other.state === "unknown");
	return stuck >= 0 && held.indexOf(message) > stuck ? "earlier" : step;
}

/** What a held message that went wrong says, and why when Codex gave no reason. */
const PROBLEM_WORDS = {
	failed: ["Not sent", "refused"],
	unknown: ["May not have arrived", "no answer"],
} as const;

/**
 * Where a held message stands, in words.
 * @param message The message.
 * @param step What held work waits on.
 * @returns The words and whether they report a problem.
 */
function heldWords(
	message: HeldMessage,
	step: WaitsOn,
): { readonly text: string; readonly problem: boolean } {
	if (message.state === "failed" || message.state === "unknown") {
		const [what, why] = PROBLEM_WORDS[message.state];
		return { text: `${what} · ${message.reason ?? why}`, problem: true };
	}
	return {
		text: message.state === "waiting" && step !== null ? WAITS_ON[step] : "Sending",
		problem: false,
	};
}

/**
 * A message the person sent that is still on its way.
 * @param props The message, what it waits on, and the actions.
 * @param props.message The held message.
 * @param props.step What held work waits on.
 * @param props.actions The actions.
 * @returns The prompt and its state.
 */
function HeldPrompt(props: {
	readonly message: HeldMessage;
	readonly step: WaitsOn;
	readonly actions: AgentActions;
}): JSX.Element {
	const { message, actions } = props;
	const { text, problem } = heldWords(message, props.step);
	const retry = useCallback(() => actions.retry(message.id), [actions, message.id]);
	const edit = useCallback(() => actions.edit(message.id), [actions, message.id]);
	return (
		<div data-slot="held-prompt" data-state={message.state} className="flex flex-col gap-1.5">
			<div className="bg-muted border-border rounded-panel border px-3 py-2 text-[13.5px] leading-[21px] whitespace-pre-wrap opacity-80">
				{message.text}
			</div>
			<p
				className={`text-body flex items-center gap-2 ${problem ? "text-destructive" : "text-muted-foreground"}`}
			>
				{!problem && (
					<span
						aria-hidden="true"
						className="bg-status size-1.5 rounded-full motion-safe:animate-pulse"
					/>
				)}
				<span className="min-w-0 flex-1">{text}</span>
				{problem && (
					<>
						<button
							type="button"
							onClick={retry}
							className="text-primary-text decoration-primary-mark -mx-1 min-h-6 px-1 font-medium underline underline-offset-2 hover:decoration-2"
						>
							{message.state === "unknown" ? "Send again" : "Retry"}
						</button>
						<button
							type="button"
							onClick={edit}
							className="text-foreground -mx-1 min-h-6 px-1 font-medium hover:underline"
						>
							Edit
						</button>
					</>
				)}
			</p>
		</div>
	);
}

/**
 * A prompt queued behind the running turn: send it now, move it, or drop it.
 * @param props The entry, its place, and the actions.
 * @param props.entry The queued entry.
 * @param props.first Whether it is first in the queue.
 * @param props.last Whether it is last.
 * @param props.actions The actions.
 * @returns The prompt.
 */
function QueuedPrompt(props: {
	readonly entry: BrowserSnapshot["queue"]["entries"][number];
	readonly first: boolean;
	readonly last: boolean;
	readonly actions: AgentActions;
}): JSX.Element {
	const { entry, actions } = props;
	const id = entry.submissionId;
	const sendNow = useCallback(() => actions.queue.sendNow(id), [actions, id]);
	const up = useCallback(() => actions.queue.moveUp(id), [actions, id]);
	const down = useCallback(() => actions.queue.moveDown(id), [actions, id]);
	const remove = useCallback(() => actions.queue.remove(id), [actions, id]);
	return (
		<div
			data-slot="queued-prompt"
			className="border-border rounded-panel flex flex-col gap-1 border border-dashed px-3 py-2"
		>
			<p className="text-[13.5px] leading-[21px] whitespace-pre-wrap">{entry.prompt}</p>
			<div className="text-body text-muted-foreground flex items-center gap-1">
				<span className="flex-1">Queued</span>
				<IconAction label="Send now" onClick={sendNow}>
					<RiSendPlaneLine />
				</IconAction>
				{!props.first && (
					<IconAction label="Move up" onClick={up}>
						<RiArrowUpLine />
					</IconAction>
				)}
				{!props.last && (
					<IconAction label="Move down" onClick={down}>
						<RiArrowDownLine />
					</IconAction>
				)}
				<IconAction label="Remove" onClick={remove}>
					<RiCloseLine />
				</IconAction>
			</div>
		</div>
	);
}

export { PendingWork, type PendingWorkProps };
