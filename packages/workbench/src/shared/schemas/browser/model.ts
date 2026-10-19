import { createBrowserSchemas } from "#shared/schemas/browser/snapshot.ts";
import { createIdentitySchemas } from "#shared/schemas/browser/scalars.ts";
import type { IdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { IdentityContext } from "#shared/schemas/browser/scalars.ts";

/**
 * Builds the complete browser model, every identity and DTO schema, bound to
 * one identity authority so nothing the browser exchanges can name a child,
 * epoch or identity the session did not issue.
 * @param context - The identity authorities, or a decoder-and-validator context with an optional operation capability.
 * @returns The identity schemas together with the browser DTO and command schemas.
 */
function createCodexBrowserModel(context: IdentityContext | IdentityAuthorities) {
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
