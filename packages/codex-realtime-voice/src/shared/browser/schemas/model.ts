import { createBrowserSchemas } from "#shared/browser/schemas/snapshot.ts";
import { createIdentitySchemas } from "#shared/browser/schemas/scalars.ts";
import type { IdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { IdentityContext } from "#shared/browser/schemas/scalars.ts";
import { wireIdentityContext } from "#shared/browser/schemas/wire-identity.ts";

/**
 * Builds the complete browser model, every identity and DTO schema. The server binds it to one
 * identity authority, so nothing the browser exchanges can name a child, epoch or identity the
 * session did not issue. Without a context it is the browser's own model: each identity is a
 * validated wire string, and the gateway answers authority and current-epoch questions.
 * @param context - The identity authorities, or a decoder-and-validator context with an optional operation capability.
 * @returns The identity schemas together with the browser DTO and command schemas.
 */
function createCodexBrowserModel(
	context: IdentityContext | IdentityAuthorities = wireIdentityContext,
) {
	const normalizedContext: IdentityContext =
		"identity" in context ? { ...context.identity, operation: context.operation } : context;
	const identity = createIdentitySchemas(normalizedContext);
	return {
		...identity,
		...createBrowserSchemas(identity, normalizedContext),
	};
}

type CodexBrowserModel = ReturnType<typeof createCodexBrowserModel>;

export { createCodexBrowserModel, type CodexBrowserModel };
