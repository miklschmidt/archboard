import { useCallback, type FormEvent } from "react";
import {
	approvalChoices,
	type ExampleApproval,
	type ApprovalResponse,
} from "#ui/rules/workbench/approval-responses.ts";

interface ApprovalCardProps {
	readonly approval: ExampleApproval;
	readonly disabled: boolean;
	readonly respond: (response: ApprovalResponse) => Promise<boolean>;
}

/**
 * Show a request and the explicit responses this example supports.
 * @param props The rendered state and its action owners.
 * @param props.approval The request that the user sees.
 * @param props.disabled Whether these controls are unavailable.
 * @param props.respond The response delivery operation.
 * @returns The rendered controls or content.
 */
function ApprovalCard({ approval, disabled, respond }: ApprovalCardProps) {
	const pending = approval.lifecycle.state === "pending";
	return (
		<article className="approval">
			<h3>Your decision is needed</h3>
			<ApprovalDetails approval={approval} />
			{approval.approvalKind === "user_input" && (
				<QuestionForm approval={approval} disabled={disabled || !pending} respond={respond} />
			)}
			<div className="actions">
				{approvalChoices(approval).map((choice) => (
					<ApprovalDecision
						key={choice.label}
						choice={choice}
						respond={respond}
						disabled={disabled || !pending}
					/>
				))}
			</div>
			{!pending && <output>{approval.lifecycle.state.replaceAll("_", " ")}</output>}
		</article>
	);
}

/**
 * Present the requested action without hiding commands or permission scope.
 * @param props The rendered state and its action owners.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalDetails({ approval }: Pick<ApprovalCardProps, "approval">) {
	if (approval.approvalKind === "permissions")
		return (
			<>
				<p>This example can decline access requests. It does not grant broader permissions.</p>
				<pre>{JSON.stringify(approval.requestedScope, null, 2)}</pre>
			</>
		);
	if (approval.approvalKind === "elicitation")
		return (
			<>
				<p>{approval.message}</p>
				<p>This example can decline this structured request.</p>
			</>
		);
	return (
		<>
			<p>{approval.approvalKind.replaceAll("_", " ")}</p>
			{"fileCount" in approval && <p>{approval.fileCount} files</p>}
			<ApprovalReason approval={approval} />
			<ApprovalCommand approval={approval} />
		</>
	);
}

/**
 * Show a supplied explanation when the request carries one.
 * @param props The rendered state and its action owners.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalReason({ approval }: Pick<ApprovalCardProps, "approval">) {
	if (!("reason" in approval)) return null;
	return <p>{approval.reason}</p>;
}

/**
 * Show the exact command when this approval concerns command execution.
 * @param props The rendered state and its action owners.
 * @param props.approval The request that the user sees.
 * @returns The rendered controls or content.
 */
function ApprovalCommand({ approval }: Pick<ApprovalCardProps, "approval">) {
	if (!("command" in approval)) return null;
	const text = Array.isArray(approval.command) ? approval.command.join(" ") : approval.command;
	return <pre>{text}</pre>;
}

/**
 * Bind one offered decision to the request that the user saw.
 * @param props The rendered state and its action owners.
 * @param props.choice The exact offered decision.
 * @param props.respond The response delivery operation.
 * @param props.disabled Whether these controls are unavailable.
 * @returns The rendered controls or content.
 */
function ApprovalDecision({
	choice,
	respond,
	disabled,
}: {
	readonly choice: ReturnType<typeof approvalChoices>[number];
	readonly respond: ApprovalCardProps["respond"];
	readonly disabled: boolean;
}) {
	const choose = useCallback(() => {
		void respond(choice.response);
	}, [choice, respond]);
	return (
		<button disabled={disabled} onClick={choose}>
			{choice.label}
		</button>
	);
}

/**
 * Collect answers through native form fields and clear secrets after delivery.
 * @param props The rendered state and its action owners.
 * @param props.approval The request that the user sees.
 * @param props.disabled Whether these controls are unavailable.
 * @param props.respond The response delivery operation.
 * @returns The rendered controls or content.
 */
function QuestionForm({
	approval,
	disabled,
	respond,
}: Omit<ApprovalCardProps, "approval"> & {
	readonly approval: Extract<ExampleApproval, { approvalKind: "user_input" }>;
}) {
	const submit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const form = event.currentTarget;
			const values = new FormData(form);
			const answers = Object.fromEntries(
				approval.questions.map((question) => [
					question.id,
					{ answers: [formAnswer(values, question.id)] },
				]),
			);
			void respond({ approvalKind: "user_input", answers }).then((sent) => {
				if (sent) form.reset();
				return sent;
			});
		},
		[approval, respond],
	);
	return (
		<form onSubmit={submit}>
			<fieldset disabled={disabled}>
				{approval.questions.map((question) => (
					<QuestionField key={question.id} question={question} />
				))}
			</fieldset>
			<button disabled={disabled} type="submit">
				Send answer
			</button>
		</form>
	);
}

/**
 * Render one question with the server's available choices.
 * @param props The rendered state and its action owners.
 * @param props.question The question to answer.
 * @returns The rendered controls or content.
 */
function QuestionField({
	question,
}: {
	readonly question: Extract<ExampleApproval, { approvalKind: "user_input" }>["questions"][number];
}) {
	if (question.options === null || question.isOther)
		return (
			<label>
				{question.question}
				<input required type={question.isSecret ? "password" : "text"} name={question.id} />
			</label>
		);
	return (
		<label>
			{question.question}
			<select required name={question.id} defaultValue="">
				<option value="">Choose an answer</option>
				{question.options.map((option) => (
					<option key={option.label} value={option.label}>
						{option.label} · {option.description}
					</option>
				))}
			</select>
		</label>
	);
}

/**
 * Read a text answer without accepting file input.
 * @param values The values value.
 * @param id The id value.
 * @returns The rendered controls or content.
 */
function formAnswer(values: FormData, id: string): string {
	const value = values.get(id);
	return typeof value === "string" ? value : "";
}

export { ApprovalCard };
