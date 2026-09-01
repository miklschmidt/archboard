import { CodexWorkbenchCompositionError } from "./codex-workbench-error.js";
import { CODEX_GENERATION_REGISTRATION_KEYS } from "./codex-workbench-generation-contract.js";
import type {
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationRegistrations,
	CodexWorkbenchGenerationSlots,
	CodexWorkbenchGenerationState,
	CodexWorkbenchOwnerRuntime,
	CodexWorkbenchOwnerSlots,
	CodexWorkbenchRetainedState,
} from "./codex-workbench.js";

const RETAINED_STATE_KEYS = Object.freeze([
	"owner",
	"generation",
	"state",
	"failure",
	"process",
	"control",
] satisfies readonly (keyof CodexWorkbenchRetainedState)[]);
const RETAINED_PROCESS_KEYS = Object.freeze([
	"start",
	"stop",
	"snapshot",
	"currentChild",
	"onChild",
	"subscribe",
] satisfies readonly (keyof NonNullable<CodexWorkbenchRetainedState["process"]>)[]);
const OWNER_SLOT_KEYS = Object.freeze([
	"start",
	"reload",
	"shutdown",
	"snapshot",
	"gateway",
] satisfies readonly (keyof CodexWorkbenchOwnerSlots)[]);
const OWNER_RUNTIME_KEYS = Object.freeze([
	"process",
	"generation",
	"child",
	"startPromise",
	"shutdownPromise",
	"childRetiring",
	"released",
] satisfies readonly (keyof CodexWorkbenchOwnerRuntime)[]);
const GENERATION_STATE_KEYS = Object.freeze([
	"components",
	"owners",
	"current",
	"registrations",
	"pendingChildSettlements",
	"stopped",
	"stopPromise",
	"stopComplete",
	"stopFinished",
] satisfies readonly (keyof CodexWorkbenchGenerationState)[]);
const GENERATION_SLOT_KEYS = Object.freeze([
	"hooks",
	"onChildExitStart",
	"onChildExitFinished",
	"route",
	"onNotification",
	"onExit",
	"replaceHooks",
	"stop",
	"finishStop",
] satisfies readonly (keyof CodexWorkbenchGenerationSlots)[]);
const GENERATION_HOOK_KEYS = Object.freeze([
	"threadContext",
	"installIdentityDecoders",
	"installLifecycleSignals",
	"installApprovalProjection",
	"installBrowserGateway",
	"initializeSession",
	"stopBrowser",
	"stopRealtime",
	"stopQueue",
	"cancelDynamicApprovalsAndWaits",
	"settleOrdinaryRequests",
] satisfies readonly (keyof CodexWorkbenchGenerationHooks)[]);
const GENERATION_SLOT_FUNCTION_KEYS = Object.freeze([
	"route",
	"onNotification",
	"onExit",
	"replaceHooks",
	"stop",
	"finishStop",
] satisfies readonly (keyof CodexWorkbenchGenerationSlots)[]);
const FUNCTION_INTRINSIC_KEYS: readonly PropertyKey[] = Object.freeze([
	"length",
	"name",
	"prototype",
	"arguments",
	"caller",
]);
const FUNCTION_PROTOTYPE = Function.prototype;
const ASYNC_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function () {});
const GENERATOR_FUNCTION_PROTOTYPE = Object.getPrototypeOf(function* () {});
const ASYNC_GENERATOR_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function* () {});
const FUNCTION_PROTOTYPE_KEYS = Object.freeze(Reflect.ownKeys(FUNCTION_PROTOTYPE));
const ASYNC_FUNCTION_PROTOTYPE_KEYS = Object.freeze(Reflect.ownKeys(ASYNC_FUNCTION_PROTOTYPE));
const GENERATOR_FUNCTION_PROTOTYPE_KEYS = Object.freeze(
	Reflect.ownKeys(GENERATOR_FUNCTION_PROTOTYPE),
);
const ASYNC_GENERATOR_FUNCTION_PROTOTYPE_KEYS = Object.freeze(
	Reflect.ownKeys(ASYNC_GENERATOR_FUNCTION_PROTOTYPE),
);

function exactOwnKeys(value: object, expected: readonly (string | symbol)[], label: string): void {
	const actual = Reflect.ownKeys(value);
	if (actual.length !== expected.length || expected.some((key) => !actual.includes(key)))
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} contains a value outside its retained allowlist.`,
		);
}

function assertPlainRecord(value: object, label: string): void {
	if (Object.getPrototypeOf(value) !== Object.prototype)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} has a retained prototype attachment.`,
		);
}

function assertStableFunction(
	value: unknown,
	label: string,
): asserts value is (...args: never[]) => unknown {
	const prototype = typeof value === "function" ? Object.getPrototypeOf(value) : null;
	const prototypeKeys =
		prototype === FUNCTION_PROTOTYPE
			? FUNCTION_PROTOTYPE_KEYS
			: prototype === ASYNC_FUNCTION_PROTOTYPE
				? ASYNC_FUNCTION_PROTOTYPE_KEYS
				: prototype === GENERATOR_FUNCTION_PROTOTYPE
					? GENERATOR_FUNCTION_PROTOTYPE_KEYS
					: prototype === ASYNC_GENERATOR_FUNCTION_PROTOTYPE
						? ASYNC_GENERATOR_FUNCTION_PROTOTYPE_KEYS
						: null;
	if (typeof value !== "function" || prototypeKeys === null)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} is not a plain callable slot.`,
		);
	exactOwnKeys(prototype, prototypeKeys, `${label}'s intrinsic callable prototype`);
	const attached = Reflect.ownKeys(value).filter(
		(property) => !FUNCTION_INTRINSIC_KEYS.includes(property),
	);
	if (attached.length > 0)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} has a reachable attached value.`,
		);
}

function assertGenerationSlots(slots: CodexWorkbenchGenerationSlots): void {
	assertPlainRecord(slots, "The retained Codex current generation slots");
	exactOwnKeys(slots, GENERATION_SLOT_KEYS, "The retained Codex current generation slots");
	for (const key of GENERATION_SLOT_FUNCTION_KEYS)
		assertStableFunction(slots[key], `The retained Codex generation member ${key}`);
	for (const [key, callback] of [
		["onChildExitStart", slots.onChildExitStart],
		["onChildExitFinished", slots.onChildExitFinished],
	] as const)
		if (callback !== null)
			assertStableFunction(callback, `The retained Codex generation callback ${key}`);

	assertPlainRecord(slots.hooks, "The retained Codex generation hooks");
	exactOwnKeys(slots.hooks, GENERATION_HOOK_KEYS, "The retained Codex generation hooks");
	for (const key of GENERATION_HOOK_KEYS)
		if (key !== "threadContext")
			assertStableFunction(slots.hooks[key], `The retained Codex generation hook ${key}`);
	assertPlainRecord(slots.hooks.threadContext, "The retained Codex thread-context hooks");
	exactOwnKeys(
		slots.hooks.threadContext,
		["contextForEvent"],
		"The retained Codex thread-context hooks",
	);
	assertStableFunction(
		slots.hooks.threadContext.contextForEvent,
		"The retained Codex thread-context hook contextForEvent",
	);
}

function assertGenerationRegistrations(registrations: CodexWorkbenchGenerationRegistrations): void {
	assertPlainRecord(registrations, "The retained Codex generation registrations");
	exactOwnKeys(
		registrations,
		CODEX_GENERATION_REGISTRATION_KEYS,
		"The retained Codex generation registrations",
	);
	for (const key of CODEX_GENERATION_REGISTRATION_KEYS) {
		const cleanup = registrations[key];
		if (cleanup !== null)
			assertStableFunction(cleanup, `The retained Codex generation cleanup ${key}`);
	}
}

/** Fail closed if a retained slot hides a source-generation owner or attached capability. */
export function assertCodexWorkbenchRetainedState(retained: CodexWorkbenchRetainedState): void {
	exactOwnKeys(retained, RETAINED_STATE_KEYS, "The Codex retained state");
	assertPlainRecord(retained, "The Codex retained state");
	if (!Number.isSafeInteger(retained.generation) || retained.generation < 0)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The Codex retained generation is not version-neutral plain data.",
		);
	if (retained.process !== null) {
		exactOwnKeys(retained.process, RETAINED_PROCESS_KEYS, "The retained Codex process handle");
		assertPlainRecord(retained.process, "The retained Codex process handle");
		for (const key of RETAINED_PROCESS_KEYS)
			assertStableFunction(retained.process[key], `The retained Codex process member ${key}`);
	}
	assertPlainRecord(retained.control, "The retained Codex control cell");
	exactOwnKeys(
		retained.control,
		["current", "runtime", "wrappers"],
		"The retained Codex control cell",
	);
	if (retained.control.runtime !== null) {
		const runtime = retained.control.runtime;
		assertPlainRecord(runtime, "The retained Codex process-lifetime state port");
		exactOwnKeys(runtime, OWNER_RUNTIME_KEYS, "The retained Codex process-lifetime state port");
		if (runtime.process !== retained.process)
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex runtime does not reference the exact retained process handle.",
			);
		if (runtime.generation !== null) {
			const generation = runtime.generation;
			assertPlainRecord(generation, "The retained Codex generation state port");
			exactOwnKeys(generation, GENERATION_STATE_KEYS, "The retained Codex generation state port");
			if (generation.current !== null) assertGenerationSlots(generation.current);
			assertGenerationRegistrations(generation.registrations);
		}
	}
	for (const [label, slots] of [
		["stable wrappers", retained.control.wrappers],
		["current generation slots", retained.control.current],
	] as const) {
		if (slots === null) continue;
		assertPlainRecord(slots, `The Codex ${label}`);
		exactOwnKeys(slots, OWNER_SLOT_KEYS, `The Codex ${label}`);
		for (const key of OWNER_SLOT_KEYS)
			assertStableFunction(slots[key], `The Codex ${label} member ${key}`);
	}
}
