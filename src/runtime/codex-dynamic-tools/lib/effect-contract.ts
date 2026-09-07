import type { ToolArgument } from "@/runtime/codex-thread-tools";
import type { DynamicAuthorityToken } from "@/runtime/codex-dynamic-tools/lib/authority-token";
import type { DynamicRelation } from "@/runtime/codex-dynamic-tools/lib/vocabulary";

type DynamicForkEffectArguments = Readonly<{
	readonly threadId: string;
	readonly beforeTurnId: string | null;
	readonly prompt: string | null;
}>;

type DynamicImmutableEffect =
	| Readonly<{
			readonly tool: "create_thread";
			readonly arguments: ToolArgument<"create_thread">;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: null;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string;
			readonly visualSummary: string;
	  }>
	| Readonly<{
			readonly tool: "fork_thread";
			readonly arguments: DynamicForkEffectArguments;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: DynamicAuthorityToken;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: Readonly<{
				readonly relation: DynamicRelation;
				readonly beforeTurnId: string | null;
			}>;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string | null;
			readonly visualSummary: string;
	  }>
	| Readonly<{
			readonly tool: "send_message_to_thread";
			readonly arguments: ToolArgument<"send_message_to_thread">;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: DynamicAuthorityToken;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: null;
			readonly visualSummary: string;
	  }>;

/* The effect fields are deliberately repeated in each union member: tool and
 * arguments must narrow together at every remote boundary. */
type DynamicEffectFields = {
	readonly callerAuthority: DynamicAuthorityToken;
	readonly targetAuthority: DynamicAuthorityToken | null;
	readonly contextAuthority: DynamicAuthorityToken;
	readonly effectiveBoundary: Readonly<{
		readonly relation: DynamicRelation;
		readonly beforeTurnId: string | null;
	}> | null;
	readonly mutationOperationId: string;
	readonly initialTurnOperationId: string | null;
	readonly visualSummary: string;
};

export type { DynamicEffectFields, DynamicForkEffectArguments, DynamicImmutableEffect };
