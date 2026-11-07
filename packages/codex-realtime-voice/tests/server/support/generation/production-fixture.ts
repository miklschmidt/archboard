import { join } from "node:path";
import { createBrowserLeaseLedger } from "#server/lease/services/lease.ts";
import { createProductionBindings } from "#server/generation/services/bindings.ts";
import { createProductionHooks } from "#server/generation/services/hooks.ts";
import { createGenerationOwnerStore } from "#server/generation/services/owners.ts";
import type { CodexWorkbenchGenerationInput } from "#server/owner/services/owner-state.ts";
import type { CodexWorkbenchHostPolicy } from "#server/generation/protocol/host.ts";
import {
	TEST_CONTEXT_CODEC,
	TEST_INSTRUCTIONS,
	createTestVoicePolicy,
	testContextFixture,
} from "#tests/runtime/support/host.ts";

export function createProductionBindingsFixture(
	hostOverrides: Partial<CodexWorkbenchHostPolicy> = {},
) {
	const root = "/fixture";
	const host: CodexWorkbenchHostPolicy = {
		instructions: TEST_INSTRUCTIONS,
		contextCodec: TEST_CONTEXT_CODEC,
		resolveCheckout: (named) => named,
		voiceFor: () => createTestVoicePolicy(),
		coordinatorContextFor: () => ({ read: () => "{}", subscribe: () => () => undefined }),
		contextForOperation: () => testContextFixture,
		shownCheckoutOf: () => "/work/project",
		shownConversationOf: () => null,
		onShownChange: () => () => undefined,
		checkoutLabel: (checkout) => checkout,
		onFatal: (error) => {
			throw error;
		},
		...hostOverrides,
	};
	const server = { host };
	const storage = {
		root,
		codexHome: join(root, "codex-home"),
		sqliteHome: join(root, "sqlite-home"),
		ownerDirectory: join(root, "owner"),
		coordinatorDirectory: join(root, "coordinator"),
		epochRoot: join(root, "epoch"),
		configPath: join(root, "config.toml"),
	};
	const generations = createGenerationOwnerStore();
	const leaseLedger = createBrowserLeaseLedger();
	return {
		bindings: (input: CodexWorkbenchGenerationInput) =>
			createProductionBindings({
				server,
				storage,
				input,
				owners: generations.for(input),
				leaseLedger,
			}),
		hooks: (input: CodexWorkbenchGenerationInput) =>
			createProductionHooks({ server, storage, input, owners: generations.for(input) }),
		close: () => undefined,
	};
}
