import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClientSnapshot,
} from "@archboard/codex-realtime-voice/browser";
import { useVoiceClient, useVoiceState } from "@archboard/codex-realtime-voice/react";
import { Conversation } from "#ui/components/workbench/Conversation.tsx";
import { ApprovalCard } from "#ui/components/workbench/ApprovalCard.tsx";

/**
 * Keep composer state with the workhorse that receives it.
 * @returns The rendered controls or content.
 */
function WorkhorsePanel() {
	const client = useVoiceClient();
	const state = useVoiceState();
	const [draft, setDraft] = useState("");
	const running = workIsRunning(state);
	const ready = state.server?.account.state === "ready";
	const stop = useCallback(() => {
		void client.stopWork();
	}, [client]);
	const edit = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
		[],
	);
	const submit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const prompt = draft.trim();
			if (!prompt) return;
			void client.send(prompt).then((sent) => {
				if (sent) setDraft("");
				return sent;
			});
		},
		[client, draft],
	);
	return (
		<section className="panel work-panel" aria-labelledby="workhorse-heading">
			<div className="panel-heading">
				<h2 id="workhorse-heading">Workhorse</h2>
				<output>{running ? "Working" : "Ready"}</output>
				<button disabled={!running} onClick={stop}>
					Stop work
				</button>
			</div>
			<Conversation timeline={state.server?.timeline} />
			<ApprovalList state={state} />
			<form className="composer" onSubmit={submit}>
				<label htmlFor="prompt">Message the workhorse</label>
				<textarea
					id="prompt"
					value={draft}
					disabled={!ready}
					onChange={edit}
					placeholder="Describe the work to complete in this checkout."
				/>
				<button className="primary" type="submit" disabled={!canSend(state, running, draft)}>
					Send
				</button>
			</form>
		</section>
	);
}

/**
 * Decide whether the composer can deliver a new turn.
 * @param state The client state.
 * @param running Whether a workhorse turn runs.
 * @param draft The message composed by the user.
 * @returns Whether Send is offered.
 */
function canSend(state: VoiceClientSnapshot, running: boolean, draft: string): boolean {
	if (state.busy || running || draft.trim().length === 0) return false;
	return state.connection === "connected" && state.server?.account.state === "ready";
}

/**
 * Show each approval with the intent of the state that rendered it.
 * @param props The rendered state.
 * @param props.state The client state.
 * @returns The rendered controls or content.
 */
function ApprovalList({ state }: { readonly state: VoiceClientSnapshot }) {
	const approvals = state.server === null ? [] : state.server.approvals;
	return approvals.map((approval) => (
		<ApprovalEntry key={String(approval.requestId)} state={state} approval={approval} />
	));
}

/**
 * Bind a response to its rendered request and captured intent.
 * @param props The rendered state.
 * @param props.state The client state that rendered the request.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalEntry({
	state,
	approval,
}: {
	readonly state: VoiceClientSnapshot;
	readonly approval: VoiceApproval;
}) {
	const client = useVoiceClient();
	const respond = useCallback(
		(response: VoiceApprovalResponse) => {
			if (state.intent === null) return Promise.resolve(false);
			return client.answerApproval(approval, response, state.intent);
		},
		[client, state.intent, approval],
	);
	return (
		<ApprovalCard
			approval={approval}
			disabled={state.busy || state.intent === null}
			respond={respond}
		/>
	);
}

/**
 * Read whether a workhorse turn still runs.
 * @param state The client state.
 * @returns Whether a turn is in progress.
 */
function workIsRunning(state: VoiceClientSnapshot): boolean {
	return state.server?.timeline?.turns.some((turn) => turn.status === "inProgress") ?? false;
}

export { WorkhorsePanel };
