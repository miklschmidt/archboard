import type {
	DynamicContextPort,
	DynamicOperationIdPort,
	DynamicThreadAuthorityPort,
	DynamicToolApprovalPort,
	DynamicToolLifecyclePort,
} from "../index.js";

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;

type ApprovalPortKeys = Assert<
	Equal<
		keyof DynamicToolApprovalPort,
		"presentImmutableRequest" | "awaitOneExactVisualDecision" | "settleIdentityAndEffectHashOnce"
	>
>;
type ThreadAuthorityPortKeys = Assert<
	Equal<
		keyof DynamicThreadAuthorityPort,
		| "resolveExactLogicalCaller"
		| "classifyExactTarget"
		| "resolveExactTurnBoundary"
		| "revalidateCaller"
		| "revalidateTarget"
	>
>;
type ContextPortKeys = Assert<
	Equal<
		keyof DynamicContextPort,
		"issueAndRevalidatePaneLinkAuthority" | "readOneFreshArchboardContext"
	>
>;
type OperationPortKeys = Assert<
	Equal<
		keyof DynamicOperationIdPort,
		| "issueCanonicalOperationId"
		| "validateCurrentUnconsumedOperationId"
		| "serializeForOwnedWireFields"
		| "terminalizeCanonicalOperationId"
		| "readCanonicalOperationTerminalResult"
	>
>;
type LifecyclePortKeys = Assert<
	Equal<
		keyof DynamicToolLifecyclePort,
		| "assertCallExecuting"
		| "registerWaitOwner"
		| "releaseWaitOwner"
		| "releaseWaitOwnersForChild"
		| "poisonEpochAndOwnMutationQuarantine"
		| "failClosedShutdownEpoch"
		| "reportFatalLifecycleFault"
		| "waitForTargets"
	>
>;

type NoSevenFamilyApprovalSurface = Assert<
	Equal<
		Extract<keyof DynamicToolApprovalPort, "requestApproval" | "respondApproval" | "resume">,
		never
	>
>;
type NoAlternateOperationIssuer = Assert<
	Equal<Extract<keyof DynamicOperationIdPort, "mint" | "adopt" | "retire" | "issue">, never>
>;

export const dynamicPortContractFixture = Object.freeze({
	approval: true satisfies ApprovalPortKeys,
	threadAuthority: true satisfies ThreadAuthorityPortKeys,
	context: true satisfies ContextPortKeys,
	operationId: true satisfies OperationPortKeys,
	lifecycle: true satisfies LifecyclePortKeys,
	noSevenFamilyApprovalSurface: true satisfies NoSevenFamilyApprovalSurface,
	noAlternateOperationIssuer: true satisfies NoAlternateOperationIssuer,
});
