import { CodexWorkbenchCompositionError } from "./codex-workbench-error.js";
import type {
	CodexWorkbenchOwnerRuntime,
	CodexWorkbenchOwnerSlots,
	CodexWorkbenchRetainedState,
} from "./codex-workbench-lifecycle.js";

const RETAINED_STATE_KEYS = Object.freeze([
	"owner",
	"generation",
	"state",
	"failure",
	"process",
	"control",
] satisfies readonly (keyof CodexWorkbenchRetainedState)[]);
const PROCESS_KEYS = Object.freeze([
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
const RUNTIME_KEYS = Object.freeze([
	"process",
	"identityLedger",
	"transport",
	"operation",
	"sessionInitialized",
	"accountReady",
	"released",
	"exitBridge",
] satisfies readonly (keyof CodexWorkbenchOwnerRuntime)[]);
const TRANSPORT_KEYS = Object.freeze([
	"replaceIdentity",
	"request",
	"sendNotification",
	"registerDynamicDispatcher",
	"ownsPendingReverseRequest",
	"respond",
	"onServerRequest",
	"onServerNotification",
	"onIssue",
	"onStderr",
	"onExit",
	"inspect",
	"inspectLateResponses",
	"inspectIssues",
	"inspectStderr",
	"shutdown",
] as const);
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
const PROTOTYPE_KEYS = new Map<object, readonly (string | symbol)[]>([
	[FUNCTION_PROTOTYPE, Object.freeze(Reflect.ownKeys(FUNCTION_PROTOTYPE))],
	[ASYNC_FUNCTION_PROTOTYPE, Object.freeze(Reflect.ownKeys(ASYNC_FUNCTION_PROTOTYPE))],
	[GENERATOR_FUNCTION_PROTOTYPE, Object.freeze(Reflect.ownKeys(GENERATOR_FUNCTION_PROTOTYPE))],
	[
		ASYNC_GENERATOR_FUNCTION_PROTOTYPE,
		Object.freeze(Reflect.ownKeys(ASYNC_GENERATOR_FUNCTION_PROTOTYPE)),
	],
]);

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
	const expected = prototype === null ? undefined : PROTOTYPE_KEYS.get(prototype);
	if (typeof value !== "function" || expected === undefined)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} is not a plain callable slot.`,
		);
	exactOwnKeys(prototype, expected, `${label}'s intrinsic callable prototype`);
	const attached = Reflect.ownKeys(value).filter(
		(property) => !FUNCTION_INTRINSIC_KEYS.includes(property),
	);
	if (attached.length > 0)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			`${label} has a reachable attached value.`,
		);
}

function assertCallableRecord(value: object, keys: readonly string[], label: string): void {
	assertPlainRecord(value, label);
	exactOwnKeys(value, keys, label);
	for (const key of keys)
		assertStableFunction((value as Record<string, unknown>)[key], `${label} member ${key}`);
}

function assertIdentityLedger(runtime: CodexWorkbenchOwnerRuntime): void {
	const ledger = runtime.identityLedger;
	if (ledger === null) {
		if (runtime.transport !== null)
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex transport has no identity ledger.",
			);
		return;
	}
	assertPlainRecord(ledger, "The retained Codex identity ledger");
	exactOwnKeys(
		ledger,
		["childId", "epoch", "issued", "rawByIdentity"],
		"The retained Codex identity ledger",
	);
	if (typeof ledger.childId !== "string" || typeof ledger.epoch !== "string")
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The retained Codex identity coordinates are not plain data.",
		);
	if (Object.getPrototypeOf(ledger.issued) !== Map.prototype)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The retained Codex issuance ledger has a prototype attachment.",
		);
	exactOwnKeys(ledger.issued, [], "The retained Codex issuance ledger");
	for (const [domain, values] of ledger.issued) {
		if (typeof domain !== "string" || Object.getPrototypeOf(values) !== Set.prototype)
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex issuance ledger contains a hidden descendant.",
			);
		exactOwnKeys(values, [], "The retained Codex issuance set");
		for (const value of values)
			if (typeof value !== "string")
				throw new CodexWorkbenchCompositionError(
					"invalid_retained_state",
					"The retained Codex issuance ledger contains a hidden descendant.",
				);
	}
	if (Object.getPrototypeOf(ledger.rawByIdentity) !== Map.prototype)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The retained Codex wire ledger has a prototype attachment.",
		);
	exactOwnKeys(ledger.rawByIdentity, [], "The retained Codex wire ledger");
	for (const [identity, raw] of ledger.rawByIdentity)
		if (
			typeof identity !== "string" ||
			(typeof raw !== "string" && (typeof raw !== "number" || !Number.isSafeInteger(raw)))
		)
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex wire ledger contains a hidden descendant.",
			);
}

/** Enforce the entire reachable retained shape; volatile graphs have no structural slot. */
export function assertCodexWorkbenchRetainedState(retained: CodexWorkbenchRetainedState): void {
	assertPlainRecord(retained, "The Codex retained state");
	exactOwnKeys(retained, RETAINED_STATE_KEYS, "The Codex retained state");
	if (!Number.isSafeInteger(retained.generation) || retained.generation < 0)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The Codex retained generation is not version-neutral plain data.",
		);
	if (retained.process !== null)
		assertCallableRecord(retained.process, PROCESS_KEYS, "The retained Codex process handle");

	assertPlainRecord(retained.control, "The retained Codex control cell");
	exactOwnKeys(
		retained.control,
		["current", "runtime", "wrappers"],
		"The retained Codex control cell",
	);
	assertCallableRecord(retained.control.wrappers, OWNER_SLOT_KEYS, "The Codex stable wrappers");
	if (retained.control.current !== null)
		assertCallableRecord(
			retained.control.current,
			OWNER_SLOT_KEYS,
			"The Codex replaceable current source slots",
		);

	const runtime = retained.control.runtime;
	if (runtime === null) return;
	assertPlainRecord(runtime, "The retained Codex process-lifetime state port");
	exactOwnKeys(runtime, RUNTIME_KEYS, "The retained Codex process-lifetime state port");
	if (runtime.process !== retained.process)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The retained Codex runtime does not reference the exact retained process handle.",
		);
	if (!Number.isSafeInteger(runtime.operation) || runtime.operation < 0)
		throw new CodexWorkbenchCompositionError(
			"invalid_retained_state",
			"The retained Codex lifecycle ticket is not plain coordination state.",
		);
	for (const value of [runtime.sessionInitialized, runtime.accountReady, runtime.released])
		if (typeof value !== "boolean")
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex coordination state contains a hidden descendant.",
			);
	assertPlainRecord(runtime.exitBridge, "The retained Codex child-exit bridge");
	exactOwnKeys(runtime.exitBridge, ["event", "handler"], "The retained Codex child-exit bridge");
	if (runtime.exitBridge.handler !== null)
		assertCallableRecord(
			runtime.exitBridge.handler,
			["handle"],
			"The retained Codex replaceable child-exit handler",
		);
	if (runtime.exitBridge.event !== null) {
		assertPlainRecord(runtime.exitBridge.event, "The retained Codex child-exit event");
		exactOwnKeys(
			runtime.exitBridge.event,
			["child", "epoch", "code", "signal"],
			"The retained Codex child-exit event",
		);
		if (
			typeof runtime.exitBridge.event.child !== "string" ||
			typeof runtime.exitBridge.event.epoch !== "string" ||
			(runtime.exitBridge.event.code !== null &&
				!Number.isSafeInteger(runtime.exitBridge.event.code)) ||
			(runtime.exitBridge.event.signal !== null &&
				typeof runtime.exitBridge.event.signal !== "string")
		)
			throw new CodexWorkbenchCompositionError(
				"invalid_retained_state",
				"The retained Codex child-exit event contains a hidden descendant.",
			);
	}
	assertIdentityLedger(runtime);
	if (runtime.transport !== null)
		assertCallableRecord(runtime.transport, TRANSPORT_KEYS, "The retained Codex transport handle");
}
