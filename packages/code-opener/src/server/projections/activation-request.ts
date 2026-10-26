import type { Request } from "express";
import { CodeTargetOpenRequestSchema } from "#shared/schemas/code-target-open.ts";

/**
 * Reads an activation request, refusing query parameters and malformed bodies.
 * @param request The incoming activation request.
 * @returns The typed request, or the 400 failure to answer with.
 */
function parseActivationRequest(request: Request) {
	if (request.url.includes("?")) {
		return {
			ok: false as const,
			failure: {
				code: "REQUEST_INVALID" as const,
				error: "Activation query parameters are not accepted.",
			},
		};
	}
	// The vault the call names is the server's own requirement and is read from the call
	// before this route runs (ADR 0049); what is left is the board and the element.
	const { vault: _named, ...link } = typeof request.body === "object" ? (request.body ?? {}) : {};
	const parsed = CodeTargetOpenRequestSchema.safeParse(link);
	return parsed.success
		? { ok: true as const, request: parsed.data }
		: {
				ok: false as const,
				failure: { code: "REQUEST_INVALID" as const, error: "The activation request is invalid." },
			};
}

export { parseActivationRequest };
