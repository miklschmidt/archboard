import { z } from "zod";

import {
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "../../codex-instructions/index.js";
import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type ArchboardAppNamespaceSpec,
} from "./manifest.js";

assertCanonicalInstructionBytes("workhorse", WORKHORSE_DEVELOPER_INSTRUCTIONS);

export const ARCHBOARD_APP_TOOL_BINDING = Object.freeze({
	namespace: ARCHBOARD_APP_NAMESPACE.name,
	manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	workhorseInstructionsSha256: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	dynamicTools: ARCHBOARD_APP_DYNAMIC_TOOLS,
});

export type ArchboardAppToolBinding = typeof ARCHBOARD_APP_TOOL_BINDING;

const ToolInstallationRequestSchema = z.strictObject({
	lifecycle: z.enum(["fresh_workhorse_start", "attach", "reconnect"]),
	provenance: z.enum(["archboard_created", "attached", "foreign", "unknown"]),
});

export type ToolInstallationRequest = z.infer<typeof ToolInstallationRequestSchema>;

const EMPTY_DYNAMIC_TOOLS: readonly ArchboardAppNamespaceSpec[] = Object.freeze([]);

function parseInstallationRequest(value: unknown): ToolInstallationRequest {
	const parsed = ToolInstallationRequestSchema.safeParse(value);
	if (!parsed.success)
		throw new TypeError(`Invalid dynamic-tool installation boundary: ${parsed.error.message}`);
	return parsed.data;
}

/** Return the immutable binding only for a fresh Archboard-created workhorse start. */
export function archboardAppToolBindingFor(value: unknown): ArchboardAppToolBinding | null {
	const request = parseInstallationRequest(value);
	if (request.lifecycle !== "fresh_workhorse_start") return null;
	if (request.provenance !== "archboard_created") return null;
	return ARCHBOARD_APP_TOOL_BINDING;
}

/** Attach and reconnect boundaries always receive no dynamic tools. */
export function archboardAppDynamicToolsFor(value: unknown): readonly ArchboardAppNamespaceSpec[] {
	return archboardAppToolBindingFor(value)?.dynamicTools ?? EMPTY_DYNAMIC_TOOLS;
}
