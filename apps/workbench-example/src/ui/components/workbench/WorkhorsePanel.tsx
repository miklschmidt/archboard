import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import type { ExampleClient, ExampleClientSnapshot } from "#ui/clients/workbench/client.ts";
import type { ExampleApproval, ApprovalResponse } from "#ui/rules/workbench/approval-responses.ts";
import { Conversation } from "#ui/components/workbench/Conversation.tsx";
import { ApprovalCard } from "#ui/components/workbench/ApprovalCard.tsx";

/**
 * Keep composer state with the workhorse that receives it.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function WorkhorsePanel({
	client,
	state,
}: {
	readonly client: ExampleClient;
	readonly state: ExampleClientSnapshot;
}) {
	const [draft, setDraft] = useState("");
	const snapshot = state.transport.snapshot;
	const running = workIsRunning(state);
	const ready = snapshot?.account.state === "ready";
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
			<Conversation timeline={snapshot?.timeline} />
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
 * @param state The current page projection.
 * @param running The running value.
 * @param draft The command composed by the user.
 * @returns The rendered controls or content.
 */
function canSend(state: ExampleClientSnapshot, running: boolean, draft: string): boolean {
	if (state.busy || running || draft.trim().length === 0) return false;
	return (
		state.transport.connection === "connected" &&
		state.transport.snapshot?.account.state === "ready"
	);
}

/**
 * Preserve the exact action intent that accompanied the displayed requests.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function ApprovalList({
	client,
	state,
}: {
	readonly client: ExampleClient;
	readonly state: ExampleClientSnapshot;
}) {
	const approvals = state.transport.snapshot === null ? [] : state.transport.snapshot.approvals;
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
 * Bind a response to its rendered request and captured connection intent.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @param props.state The current page projection.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalEntry({
	client,
	state,
	approval,
}: {
	readonly client: ExampleClient;
	readonly state: ExampleClientSnapshot;
	readonly approval: ExampleApproval;
}) {
	const respond = useCallback(
		(response: ApprovalResponse) => {
			if (state.intent === null) return Promise.resolve(false);
			return client.respond(
				{
					command: "approvalRespond",
					requestId: approval.requestId,
					approvalId: approval.approvalId,
					response,
				},
				state.intent,
			);
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
 * @param state The current page projection.
 * @returns The rendered controls or content.
 */
function workIsRunning(state: ExampleClientSnapshot): boolean {
	return (
		state.transport.snapshot?.timeline?.turns.some((turn) => turn.status === "inProgress") ?? false
	);
}

export { WorkhorsePanel };
