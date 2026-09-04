import { describe, expect, mock, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CodexWorkbenchComponents } from "../../../src/server/canvas/codex-workbench-generation.js";

const canvasRoot = path.resolve(import.meta.dir, "../../../src/server/canvas");
const runtimeRoot = path.resolve(import.meta.dir, "../../../src/runtime");
const serverRoot = path.resolve(import.meta.dir, "../../../src/server");

/** Every assembled component the factories construct; the kernel supplies identity. */
type ConstructedOwner = Exclude<keyof CodexWorkbenchComponents, "identity">;

/**
 * Every owner `createProductionCodexWorkbenchFactories` must construct, keyed by
 * its component name, naming the exact module root and exported constructor it
 * comes from. The satisfies clause pins the key set to the assembled components
 * minus `identity` (the kernel's own authority, handed to the factories rather
 * than built by them), so an eighteenth owner added to the composition is a
 * compile error here until it is listed.
 */
const REQUIRED_OWNERS = {
	epoch: { module: `${runtimeRoot}/codex-epoch/index.ts`, create: "createCodexEpochStore" },
	transport: { module: `${runtimeRoot}/codex-transport/index.ts`, create: "createCodexTransport" },
	session: { module: `${runtimeRoot}/codex-session/index.ts`, create: "createCodexSession" },
	threadLink: {
		module: `${runtimeRoot}/codex-thread-link/index.ts`,
		create: "createCodexThreadLink",
	},
	workhorse: {
		module: `${runtimeRoot}/codex-workhorse-start/index.ts`,
		create: "createCodexWorkhorseStart",
	},
	semanticPublisher: {
		module: `${runtimeRoot}/codex-semantic-context/index.ts`,
		create: "createSemanticContextPublisher",
	},
	realtime: {
		module: `${runtimeRoot}/codex-realtime/index.ts`,
		create: "createCodexRealtimeAdapter",
	},
	approvals: {
		module: `${runtimeRoot}/codex-approvals/index.ts`,
		create: "createCodexApprovalBroker",
	},
	dynamicTools: {
		module: `${runtimeRoot}/codex-dynamic-tools/index.ts`,
		create: "createCodexDynamicTools",
	},
	semanticDelivery: {
		module: `${runtimeRoot}/codex-thread-context/index.ts`,
		create: "createCodexThreadContextController",
	},
	coordinator: {
		module: `${runtimeRoot}/codex-coordinator/index.ts`,
		create: "createCodexCoordinator",
	},
	queue: {
		module: `${runtimeRoot}/codex-workhorse-queue/index.ts`,
		create: "createCodexWorkhorseQueue",
	},
	operations: {
		module: `${runtimeRoot}/codex-workhorse-operations/index.ts`,
		create: "createCodexWorkhorseOperations",
	},
	spokenApproval: {
		module: `${runtimeRoot}/codex-spoken-approval/index.ts`,
		create: "createCodexSpokenApprovalGate",
	},
	coordinatorTools: {
		module: `${runtimeRoot}/codex-coordinator-tools/index.ts`,
		create: "createCodexCoordinatorTools",
	},
	callbacks: {
		module: `${runtimeRoot}/codex-coordinator-callbacks/index.ts`,
		create: "createCodexCoordinatorCallbacks",
	},
	gateway: {
		module: `${serverRoot}/codex-workbench/index.ts`,
		create: "createCodexWorkbenchGateway",
	},
} satisfies Record<ConstructedOwner, { readonly module: string; readonly create: string }>;

/** The five dynamic ports the composition must bind once each. */
const DYNAMIC_ADAPTERS = [
	"approval",
	"threadAuthority",
	"context",
	"operationId",
	"lifecycle",
] as const;

/** One binding builder per constructed owner, derived from the same key set. */
const BINDING_BUILDERS = Object.keys(REQUIRED_OWNERS) as readonly ConstructedOwner[];

describe("production Codex workbench composition policy", () => {
	test("publishes narrow entrypoints and keeps lifecycle implementation private", () => {
		expect(existsSync(path.join(canvasRoot, "codex-workbench.ts"))).toBeFalse();
		for (const entrypoint of [
			"codex-workbench-adapters.ts",
			"codex-workbench-application.ts",
			"codex-workbench-browser.ts",
			"codex-workbench-generation.ts",
			"codex-workbench-owner.ts",
			"codex-workbench-production.ts",
		])
			expect(existsSync(path.join(canvasRoot, entrypoint)), entrypoint).toBeTrue();
		expect(existsSync(path.join(canvasRoot, "codex-workbench-lifecycle.ts"))).toBeFalse();
		expect(existsSync(path.join(canvasRoot, "lib/codex-workbench-lifecycle.ts"))).toBeTrue();
	});

	test("only the private lifecycle owner imports the private request router", async () => {
		const importers: string[] = [];
		for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: canvasRoot })) {
			if (file === "lib/codex-workbench-routing.ts") continue;
			const source = readFileSync(path.join(canvasRoot, file), "utf8");
			if (source.includes("codex-workbench-routing.js")) importers.push(file);
		}
		expect(importers.toSorted()).toEqual(["lib/codex-workbench-lifecycle.ts"]);
		expect(
			readFileSync(path.join(canvasRoot, "codex-workbench-generation.ts"), "utf8"),
		).not.toContain("createCodexWorkbenchRequestRouter");
	});

	test("the production factories construct every required owner exactly once", async () => {
		const constructions: string[] = [];
		for (const [name, owner] of Object.entries(REQUIRED_OWNERS)) {
			const actual = (await import(owner.module)) as Record<string, unknown>;
			mock.module(owner.module, () => ({
				...actual,
				[owner.create]: (...input: readonly unknown[]) => {
					constructions.push(owner.create);
					return {
						owner: name,
						options: input[0],
						dispose: () => undefined,
						inspect: () => ({ state: "open" }),
						replaceIdentity: () => undefined,
						registerDynamicDispatcher: () => undefined,
						onServerRequest: () => () => undefined,
						onServerNotification: () => () => undefined,
						onExit: () => () => undefined,
						shutdown: async () => undefined,
						close: () => undefined,
						dispatch: async () => undefined,
					};
				},
			}));
		}

		const [{ createProductionCodexWorkbenchFactories, composeCodexWorkbenchGeneration }, identity] =
			await Promise.all([
				import("../../../src/server/canvas/codex-workbench-generation.js"),
				import("../../../src/shared/codex-workbench-identity/index.js").then((module) => ({
					ledger: module.createIdentityLedger(),
					authorities: module.createIdentityAuthorities(),
				})),
			]);

		const bindingCalls: string[] = [];
		const builder = (name: string) => (): Record<string, never> => {
			bindingCalls.push(name);
			return {};
		};
		const bindings = {
			...Object.fromEntries(BINDING_BUILDERS.map((name) => [name, builder(name)])),
			dynamicAdapters: Object.fromEntries(
				DYNAMIC_ADAPTERS.map((name) => [name, builder(`dynamicAdapters.${name}`)]),
			),
			coordinatorCall: { run: async (_request: unknown, run: () => unknown) => run() },
		} as never;

		const generation = await composeCodexWorkbenchGeneration({
			identityLedger: identity.ledger,
			factories: createProductionCodexWorkbenchFactories(
				bindings,
				null,
				null,
				identity.ledger,
				identity.authorities,
			),
			hooks: {} as never,
			activate: false,
		});

		expect(constructions.toSorted()).toEqual(
			Object.values(REQUIRED_OWNERS)
				.map((one) => one.create)
				.toSorted(),
		);
		expect(bindingCalls.toSorted()).toEqual(
			[
				...BINDING_BUILDERS,
				...DYNAMIC_ADAPTERS.map((name) => `dynamicAdapters.${name}`),
			].toSorted(),
		);
		expect(generation.components.identity).toBe(identity.authorities);
		for (const name of Object.keys(REQUIRED_OWNERS) as readonly ConstructedOwner[])
			expect(
				(generation.components[name] as unknown as { readonly owner?: string }).owner,
				name,
			).toBe(name);
	});
});
