import { z } from "zod";

import {
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "@/runtime/codex-instructions";
import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
	type ArchboardAppNamespaceSpec,
} from "@/runtime/codex-thread-tools/lib/manifest";

assertCanonicalInstructionBytes("workhorse", WORKHORSE_DEVELOPER_INSTRUCTIONS);

const ARCHBOARD_APP_TOOL_BINDING = Object.freeze({
	namespace: ARCHBOARD_APP_NAMESPACE.name,
	manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	workhorseInstructionsSha256: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	dynamicTools: ARCHBOARD_APP_DYNAMIC_TOOLS,
});

type ArchboardAppToolBinding = typeof ARCHBOARD_APP_TOOL_BINDING;

const ToolInstallationRequestSchema = z.strictObject({
	lifecycle: z.enum(["fresh_workhorse_start", "attach", "reconnect"]),
	provenance: z.enum(["archboard_created", "attached", "foreign", "unknown"]),
});

type ToolInstallationRequest = z.infer<typeof ToolInstallationRequestSchema>;

const EMPTY_DYNAMIC_TOOLS: readonly ArchboardAppNamespaceSpec[] = Object.freeze([]);

/**
 * Decode the installation boundary a caller claims to be at, refusing anything that is not one of
 * the reviewed lifecycle and provenance pairs.
 * @param value - The claimed boundary.
 * @returns The decoded request.
 * @throws {TypeError} When the boundary is not a reviewed one.
 */
function parseInstallationRequest(value: unknown): ToolInstallationRequest {
	const parsed = ToolInstallationRequestSchema.safeParse(value);
	if (!parsed.success) {
		throw new TypeError(`Invalid dynamic-tool installation boundary: ${parsed.error.message}`);
	}
	return parsed.data;
}

/**
 * The immutable tool binding, and only for a fresh Archboard-created workhorse start. An attach
 * or reconnect never installs dynamic tools, which is what keeps a thread from another child or
 * another product from being handed Archboard's tools.
 * @param value - The claimed installation boundary.
 * @returns The binding, or null when this boundary installs nothing.
 */
function archboardAppToolBindingFor(value: unknown): ArchboardAppToolBinding | null {
	const request = parseInstallationRequest(value);
	if (request.lifecycle !== "fresh_workhorse_start") {
		return null;
	}
	if (request.provenance !== "archboard_created") {
		return null;
	}
	return ARCHBOARD_APP_TOOL_BINDING;
}

/**
 * The dynamic tools one installation boundary receives; attach and reconnect always receive none.
 * @param value - The claimed installation boundary.
 * @returns The tools to install, which is empty for every boundary but a fresh start.
 */
function archboardAppDynamicToolsFor(value: unknown): readonly ArchboardAppNamespaceSpec[] {
	return archboardAppToolBindingFor(value)?.dynamicTools ?? EMPTY_DYNAMIC_TOOLS;
}

export {
	ARCHBOARD_APP_TOOL_BINDING,
	type ArchboardAppToolBinding,
	type ToolInstallationRequest,
	archboardAppToolBindingFor,
	archboardAppDynamicToolsFor,
};
