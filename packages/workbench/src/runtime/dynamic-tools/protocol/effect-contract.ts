import type { ToolArgument } from "#runtime/thread-tools/protocol/arguments.ts";
import type { DynamicAuthorityToken } from "#runtime/dynamic-tools/authority/rules/authority-token.ts";
import type { DynamicRelation } from "#runtime/dynamic-tools/rules/vocabulary.ts";

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

export type { DynamicImmutableEffect };
