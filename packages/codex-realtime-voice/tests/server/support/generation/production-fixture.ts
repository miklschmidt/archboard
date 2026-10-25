import { join } from "node:path";
import { createBrowserLeaseLedger } from "#server/services/lease/lease.ts";
import { createProductionBindings } from "#server/services/generation/bindings.ts";
import { createProductionHooks } from "#server/services/generation/hooks.ts";
import { createGenerationOwnerStore } from "#server/services/generation/owners.ts";
import type { CodexWorkbenchGenerationInput } from "#server/services/owner/owner-state.ts";
import type { CodexWorkbenchHostPolicy } from "#server/protocol/generation/host.ts";
import { createSessionComponentsFixture } from "#tests/server/support/generation/session-fixture.ts";
import {
	TEST_CALLBACK_POLICY,
	TEST_CONTEXT_CODEC,
	TEST_INSTRUCTIONS,
	createTestVoicePolicy,
	testContextFixture,
} from "#tests/runtime/support/host.ts";

export function createProductionBindingsFixture(
	hostOverrides: Partial<CodexWorkbenchHostPolicy> = {},
) {
	const root = "/fixture";
	const publisher = createSessionComponentsFixture([]).semanticPublisher;
	const host: CodexWorkbenchHostPolicy = {
		instructions: TEST_INSTRUCTIONS,
		contextCodec: TEST_CONTEXT_CODEC,
		resolveCheckout: (named) => named,
		voiceFor: () => createTestVoicePolicy(),
		coordinatorContextFor: () => ({ read: () => "{}", subscribe: () => () => undefined }),
		contextForOperation: () => testContextFixture,
		sessionContextFor: () => ({ publisher, callbacks: TEST_CALLBACK_POLICY }),
		workhorseContextFor: () => ({
			publisher,
			feedId: "test-feed",
			contextForEvent: () => testContextFixture,
		}),
		shownCheckoutOf: () => "/work/project",
		shownConversationOf: () => null,
		onShownChange: () => () => undefined,
		repositoryOfCheckout: () => null,
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
		close: () => publisher.dispose(),
	};
}
