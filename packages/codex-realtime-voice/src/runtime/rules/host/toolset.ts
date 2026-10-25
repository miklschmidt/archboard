// The built-in tool namespaces as one host names them. Each role's reviewed template is filled with
// the host's namespace name (and, for the workhorse's callback, its product name), and its digest is
// taken over the exact bytes Codex is given. Everything past the Codex boundary asks which role a
// call came through, never which name.

import {
	deepFreeze,
	renderCoordinatorNamespace,
	type ReviewedNamespace,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import {
	renderCoordinatorCallbackNamespace,
	type CoordinatorCallbackNamespace,
} from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import type { VoiceAgentIdentity } from "#runtime/protocol/host/identity.ts";

/** The role a built-in namespace plays: the coordinator's two, and the workhorse's callback. */
type VoiceToolRole = "workhorse" | "voice" | "coordinator";

/** Each built-in namespace of one host, with the digest a call through it must carry. */
interface VoiceToolset {
	readonly workhorse: ReviewedNamespace;
	readonly voice: ReviewedNamespace;
	readonly coordinator: {
		readonly namespace: CoordinatorCallbackNamespace;
		readonly sha256: string;
	};
}

/**
 * Fill the reviewed templates with a host's names.
 * @param identity - The host's tool namespaces and product name.
 * @returns The host's built-in namespaces and their digests.
 */
function createVoiceToolset(
	identity: Pick<VoiceAgentIdentity, "toolNamespaces" | "productName">,
): VoiceToolset {
	const names = identity.toolNamespaces;
	return deepFreeze({
		workhorse: renderCoordinatorNamespace("workhorse", names.workhorse),
		voice: renderCoordinatorNamespace("voice", names.voice),
		coordinator: renderCoordinatorCallbackNamespace({
			namespace: names.coordinator,
			productName: identity.productName,
		}),
	});
}

const ROLES: readonly VoiceToolRole[] = Object.freeze(["workhorse", "voice", "coordinator"]);

/**
 * The role of the built-in namespace a call names, by name and, when the call carries one, digest.
 * @param toolset - The host's built-in namespaces.
 * @param call - The namespace the call names, and the manifest digest it carries.
 * @param call.namespace - The namespace name.
 * @param call.manifestHash - The digest, when the call carries one.
 * @returns The role, or null for a namespace that is not built in or a digest that is not its own.
 */
function toolRoleOf(
	toolset: VoiceToolset,
	call: { readonly namespace: unknown; readonly manifestHash?: unknown },
): VoiceToolRole | null {
	const role = ROLES.find((candidate) => toolset[candidate].namespace.name === call.namespace);
	if (role === undefined) return null;
	if (call.manifestHash !== undefined && call.manifestHash !== toolset[role].sha256) return null;
	return role;
}

export { createVoiceToolset, toolRoleOf, type VoiceToolRole, type VoiceToolset };
