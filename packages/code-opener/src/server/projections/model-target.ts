import { readArchitectureModel } from "@archboard/board/store-read";
import {
	CodeTargetFailureCodeSchema,
	type CodeTargetOpenRequest,
} from "#shared/schemas/code-target-open.ts";

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
	if (!target.ok) {
		const code = CodeTargetFailureCodeSchema.safeParse(target.code);
		return {
			ok: false as const,
			code: code.success ? code.data : ("SOURCE_UNAVAILABLE" as const),
			error: target.error,
		};
	}
	const { otherRef, ...localTarget } = target;
	return {
		ok: true as const,
		binding: reading.codeBinding!,
		target: { ...localTarget, ...(otherRef === undefined ? {} : { otherRef }) },
	};
}

export { canonicalModelTarget };
