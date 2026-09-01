import { describe, expect, test } from "bun:test";

import type { CodexWorkbenchGenerationHooks } from "../codex-workbench-generation.js";
import { reloadCodexWorkbenchGeneration } from "../codex-workbench-generation.js";
import {
	CodexWorkbenchCompositionError,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationRegistrations,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

const INSTALL_STAGES = [
	"transportRequest",
	"transportNotification",
	"transportExit",
	"threadContext",
	"identityDecoders",
	"lifecycleSignals",
	"browserGateway",
	"approvalProjection",
] as const;
type InstallStage = (typeof INSTALL_STAGES)[number];

const REGISTRATION_KEYS = [
	"transportRequest",
	"transportNotification",
	"transportExit",
	"lifecycleSignals",
	"browserGateway",
	"approvalProjection",
] as const satisfies readonly (keyof CodexWorkbenchGenerationRegistrations)[];
type RegistrationKey = (typeof REGISTRATION_KEYS)[number];
type Phase = "next" | "rollback" | "retired";

interface FailureControl {
	next: InstallStage | null;
	rollback: InstallStage | null;
	cleanup: Set<string>;
}

function messages(value: unknown): string[] {
	if (!(value instanceof Error)) return [];
	return [
		value.message,
		...(value instanceof AggregateError ? value.errors.flatMap(messages) : []),
		...messages(value.cause),
	];
}

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
}

function phaseFor(candidate: unknown, originalCandidate: unknown): Exclude<Phase, "retired"> {
	return candidate === originalCandidate ? "rollback" : "next";
}

function reloadHarness() {
	const events: string[] = [];
	const control: FailureControl = { next: null, rollback: null, cleanup: new Set() };
	const generation = fakeGeneration(events, 1);
	const state = generation.state;
	const original = state.current;
	if (original === null) throw new Error("The fake generation had no current source slots.");

	const fail = (phase: Exclude<Phase, "retired">, stage: InstallStage): void => {
		if (control[phase] === stage) throw new Error(`${phase}:${stage}:install failed`);
	};
	const cleanup = (phase: Phase, key: RegistrationKey) => () => {
		events.push(`${phase}:${key}:cleanup`);
		if (control.cleanup.has(`${phase}:${key}`)) throw new Error(`${phase}:${key}:cleanup failed`);
	};
	const transport = state.components.transport as unknown as {
		onServerRequest: (listener: unknown) => () => void;
		onServerNotification: (listener: unknown) => () => void;
		onExit: (listener: unknown) => () => void;
	};
	transport.onServerRequest = (listener) => {
		const phase = phaseFor(listener, original.route);
		fail(phase, "transportRequest");
		events.push(`${phase}:transportRequest:install`);
		return cleanup(phase, "transportRequest");
	};
	transport.onServerNotification = (listener) => {
		const phase = phaseFor(listener, original.onNotification);
		fail(phase, "transportNotification");
		events.push(`${phase}:transportNotification:install`);
		return cleanup(phase, "transportNotification");
	};
	transport.onExit = (listener) => {
		const phase = phaseFor(listener, original.onExit);
		fail(phase, "transportExit");
		events.push(`${phase}:transportExit:install`);
		return cleanup(phase, "transportExit");
	};
	(
		state.components.semanticDelivery as unknown as {
			replaceHooks: (context: unknown) => void;
		}
	).replaceHooks = (context) => {
		const phase = phaseFor(context, original.hooks.threadContext);
		fail(phase, "threadContext");
		events.push(`${phase}:threadContext:install`);
	};

	const hooks = (phase: Exclude<Phase, "retired">): CodexWorkbenchGenerationHooks => ({
		threadContext: { contextForEvent: () => ({}) as never },
		installIdentityDecoders: () => {
			fail(phase, "identityDecoders");
			events.push(`${phase}:identityDecoders:install`);
		},
		installLifecycleSignals: () => {
			fail(phase, "lifecycleSignals");
			events.push(`${phase}:lifecycleSignals:install`);
			return cleanup(phase, "lifecycleSignals");
		},
		installBrowserGateway: () => {
			fail(phase, "browserGateway");
			events.push(`${phase}:browserGateway:install`);
			return cleanup(phase, "browserGateway");
		},
		installApprovalProjection: () => {
			fail(phase, "approvalProjection");
			events.push(`${phase}:approvalProjection:install`);
			return cleanup(phase, "approvalProjection");
		},
		initializeSession: async () => undefined,
		stopBrowser: async () => undefined,
		stopRealtime: async () => undefined,
		stopQueue: () => undefined,
		cancelDynamicApprovalsAndWaits: async () => undefined,
		settleOrdinaryRequests: async () => undefined,
	});
	Object.assign(original, { hooks: hooks("rollback") });
	for (const key of REGISTRATION_KEYS) state.registrations[key] = cleanup("retired", key);

	return { control, events, generation, hooks, original, state };
}

function activeRegistrationCount(registrations: CodexWorkbenchGenerationRegistrations): number {
	return REGISTRATION_KEYS.filter((key) => registrations[key] !== null).length;
}

describe("production Codex generation reload failures", () => {
	for (const failedKey of REGISTRATION_KEYS) {
		test(`isolates retired ${failedKey} removal failure and still removes every registration`, async () => {
			const { control, events, hooks, original, state } = reloadHarness();
			control.cleanup.add(`retired:${failedKey}`);
			const failure = await rejected(
				reloadCodexWorkbenchGeneration(state, { hooks: hooks("next") }),
			);
			expect(messages(failure)).toContain(`retired:${failedKey}:cleanup failed`);
			expect(state.current).toBeNull();
			expect(activeRegistrationCount(state.registrations)).toBe(0);
			for (const key of REGISTRATION_KEYS) expect(events).toContain(`retired:${key}:cleanup`);
			expect(state.current).not.toBe(original);
		});
	}

	for (const stage of INSTALL_STAGES) {
		test(`restores the complete old generation after clean ${stage} install failure`, async () => {
			const { control, events, hooks, original, state } = reloadHarness();
			control.next = stage;
			const failure = await rejected(
				reloadCodexWorkbenchGeneration(state, { hooks: hooks("next") }),
			);
			expect(messages(failure)).toContain(`next:${stage}:install failed`);
			expect(messages(failure)).toContain(
				"Codex generation replacement failed; the previous generation was restored.",
			);
			expect(state.current).toBe(original);
			expect(activeRegistrationCount(state.registrations)).toBe(REGISTRATION_KEYS.length);
			expect(
				events.filter((event) => event.startsWith("rollback:") && event.endsWith(":install")),
			).toHaveLength(INSTALL_STAGES.length);
		});
	}

	for (const stage of INSTALL_STAGES) {
		test(`terminally releases the generation when rollback fails at ${stage}`, async () => {
			const { control, hooks, state } = reloadHarness();
			control.next = "approvalProjection";
			control.rollback = stage;
			const failure = await rejected(
				reloadCodexWorkbenchGeneration(state, { hooks: hooks("next") }),
			);
			const failureMessages = messages(failure);
			expect(failureMessages).toContain("next:approvalProjection:install failed");
			expect(failureMessages).toContain(`rollback:${stage}:install failed`);
			expect(state.current).toBeNull();
			expect(activeRegistrationCount(state.registrations)).toBe(0);
		});
	}

	test("aggregates partial-generation cleanup failures and does not attempt a mixed rollback", async () => {
		const { control, events, hooks, state } = reloadHarness();
		control.next = "approvalProjection";
		control.cleanup.add("next:browserGateway");
		control.cleanup.add("next:transportRequest");
		const failure = await rejected(reloadCodexWorkbenchGeneration(state, { hooks: hooks("next") }));
		const failureMessages = messages(failure);
		expect(failureMessages).toContain("next:approvalProjection:install failed");
		expect(failureMessages).toContain("next:browserGateway:cleanup failed");
		expect(failureMessages).toContain("next:transportRequest:cleanup failed");
		expect(events.some((event) => event.startsWith("rollback:"))).toBeFalse();
		expect(state.current).toBeNull();
		expect(activeRegistrationCount(state.registrations)).toBe(0);
	});

	test("a fatal reload revokes owner authority, resolves later shutdown, and permits reinstall", async () => {
		const events: string[] = [];
		const retained = emptyCodexWorkbenchRetainedState();
		const created: CodexWorkbenchGeneration[] = [];
		const owner = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess(events),
			createGeneration: async () => {
				const harness = reloadHarness();
				harness.state.registrations.approvalProjection = () => {
					throw new Error("retired:approvalProjection:cleanup failed");
				};
				created.push(harness.generation);
				return harness.generation;
			},
		});
		await owner.start();
		const failure = await rejected(owner.reload(reloadHarness().hooks("next")));
		expect(failure).toBeInstanceOf(CodexWorkbenchCompositionError);
		expect(messages(failure)).toContain("retired:approvalProjection:cleanup failed");
		expect(retained).toMatchObject({ owner: null, process: null, state: "failed" });
		expect(retained.control).toMatchObject({ current: null, runtime: null });
		expect((await owner.shutdown()).state).toBe("failed");
		expect(created[0]?.state.current).toBeNull();
		const replacement = installCodexWorkbenchOwner(retained, {
			createProcess: () => fakeProcess([]),
			createGeneration: async () => fakeGeneration([], 2),
		});
		await replacement.shutdown();
	});
});
