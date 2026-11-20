import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import type {
	VoiceApproval,
	VoiceApprovalResponse,
	VoiceClient,
	VoiceClientSnapshot,
} from "@archboard/codex-realtime-voice/browser";
import { useVoiceState } from "@archboard/codex-realtime-voice/react";
import { Conversation } from "#ui/workbench/components/Conversation.tsx";
import { ApprovalCard } from "#ui/workbench/components/ApprovalCard.tsx";

/**
 * Keep composer state with the workhorse that receives it.
 * @param props The page's voice client.
 * @param props.client The client.
 * @returns The rendered controls or content.
 */
function WorkhorsePanel({ client }: { readonly client: VoiceClient }) {
	const state = useVoiceState(client);
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
			<ApprovalList client={client} state={state} />
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

/** What an approval list or entry is drawn from. */
interface ApprovalsProps {
	/** The page's voice client. */
	readonly client: VoiceClient;
	/** The client state that rendered the requests. */
	readonly state: VoiceClientSnapshot;
}

/**
 * Show each approval the rendered state holds.
 * @param props The client and the rendered state.
 * @param props.client The page's voice client.
 * @param props.state The client state that rendered the requests.
 * @returns The rendered controls or content.
 */
function ApprovalList({ client, state }: ApprovalsProps) {
	const approvals = state.server === null ? [] : state.server.approvals;
	return approvals.map((approval) => (
		<ApprovalEntry
			key={String(approval.requestId)}
			client={client}
			state={state}
			approval={approval}
		/>
	));
}

/**
 * Bind a response to the request the user sees.
 * @param props The client, the rendered state and the request.
 * @param props.client The page's voice client.
 * @param props.state The client state that rendered the request.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalEntry({
	client,
	state,
	approval,
}: ApprovalsProps & { readonly approval: VoiceApproval }) {
	const respond = useCallback(
		(response: VoiceApprovalResponse) => client.answerApproval(approval, response),
		[client, approval],
	);
	return <ApprovalCard approval={approval} disabled={state.busy} respond={respond} />;
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
