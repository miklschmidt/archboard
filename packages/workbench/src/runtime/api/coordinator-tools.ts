// What the coordinator may call: the reviewed manifests with their digests, the tool and namespace names, and the input schemas that validate a call. Bun only.
export {
	COORDINATOR_IDENTITY,
	COORDINATOR_NAMESPACE_NAMES,
	COORDINATOR_THREAD_CONFIG,
} from "#runtime/protocol/coordinator-tool-contract/contracts.ts";
export {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	COORDINATOR_TOOL_MANIFEST_DIGESTS,
	verifyCoordinatorManifestIntegrity,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
export type {
	CanonicalNamespace,
	CoordinatorToolName,
	NamespaceName,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
export {
	DelegateToWorkhorseInputSchema,
	InspectWorkhorseInputSchema,
	ManageWorkhorseQueueInputSchema,
	parseCoordinatorToolInput,
	ResolveSpokenApprovalInputSchema,
	SteerWorkhorseInputSchema,
	StopWorkhorsesInputSchema,
} from "#runtime/protocol/coordinator-tool-contract/tool-inputs.ts";
export type {
	DelegateToWorkhorseInput,
	InspectWorkhorseInput,
	ManageWorkhorseQueueInput,
	ResolveSpokenApprovalInput,
	SteerWorkhorseInput,
	StopWorkhorsesInput,
} from "#runtime/protocol/coordinator-tool-contract/tool-inputs.ts";
