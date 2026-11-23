import { type CodeBinding } from "@archboard/code-binding/bindings";
import { readArchitectureModel } from "@archboard/model/store-read";
import {
	CodeTargetFailureCodeSchema,
	type CodeTargetOpenRequest,
} from "#shared/schemas/code-target-open.ts";

/**
 * Turn the reader's refusal into an opening refusal that can still offer GitHub.
 * @param target The reader's refused code target.
 * @param target.code The reader's refusal code.
 * @param target.error The reader's refusal message.
 * @param binding The binding the reader selected, when it selected one.
 * @returns The refusal, with the binding unless the source revision is unknown.
 */
function refusedTarget(target: { code: string; error: string }, binding: CodeBinding | undefined) {
	const parsed = CodeTargetFailureCodeSchema.safeParse(target.code);
	const code = parsed.success ? parsed.data : ("SOURCE_UNAVAILABLE" as const);
	// An unknown source revision gets no GitHub link, which could name the wrong version.
	return {
		ok: false as const,
		code,
		error: target.error,
		binding: code === "SOURCE_UNAVAILABLE" ? undefined : binding,
	};
}

/**
 * Resolve canonical code through the public reader, including exact source refusals.
 * @param vault The explicitly addressed architecture vault.
 * @param request The selected model, module and optional retained checkpoint.
 * @returns The effective binding and target or a structured opening refusal.
 */
async function canonicalModelTarget(
	vault: string,
	request: Extract<CodeTargetOpenRequest, { model: string }>,
) {
	const reading = await readArchitectureModel(vault, request.subject, undefined, {
		model: request.model,
		code: true,
		state: request.state,
		checkpoint: request.checkpoint,
		preview: request.preview,
	});
	if (!reading.success)
		return {
			ok: false as const,
			code: "MODEL_UNAVAILABLE" as const,
			error: reading.diagnostics.map((entry) => `${entry.message} ${entry.recovery}`).join(" "),
		};
	const target = reading.codeTarget;
	if (target === undefined)
		return {
			ok: false as const,
			code: "BINDING_UNAVAILABLE" as const,
			error: "The selected module has no available code target.",
		};
	if (!target.ok) return refusedTarget(target, reading.codeBinding);
	const { otherRef, ...localTarget } = target;
	return {
		ok: true as const,
		binding: reading.codeBinding!,
		target: { ...localTarget, ...(otherRef === undefined ? {} : { otherRef }) },
	};
}

export { canonicalModelTarget };
