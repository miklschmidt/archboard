import { isDeepStrictEqual } from "node:util";
import { COORDINATOR_CALLBACK_NAMESPACE } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import {
	VOICE_TOOL_NAMESPACE,
	WORKHORSE_TOOL_NAMESPACE,
	type CanonicalNamespace,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import type { CoordinatorThreadStartParams } from "#runtime/protocol/coordinator/contract.ts";

type ThreadStartDynamicTool = NonNullable<CoordinatorThreadStartParams["dynamicTools"]>[number];
type ThreadStartNamespace = Extract<ThreadStartDynamicTool, { type: "namespace" }>;
type CoordinatorJsonValue =
	| null
	| boolean
	| number
	| string
	| CoordinatorJsonValue[]
	| { readonly [key: string]: CoordinatorJsonValue };

/**
 * The reviewed catalogue is immutable; the generated request shape requires a mutable tools
 * array. Copy only that structural boundary while retaining the exact reviewed values and order.
 * @param namespace - The reviewed namespace.
 * @returns The namespace as thread/start accepts it.
 */
function namespaceForThreadStart(namespace: CanonicalNamespace): ThreadStartNamespace {
	return {
		type: "namespace",
		name: namespace.name,
		description: namespace.description,
		tools: namespace.tools.map((tool) => ({
			type: "function",
			name: tool.name,
			description: tool.description,
			inputSchema: coordinatorJsonValue(tool.inputSchema),
			deferLoading: tool.deferLoading,
		})),
	};
}

/**
 * Copy one reviewed tool schema as a plain JSON value the generated request type accepts. A
 * non-finite number or a value JSON cannot hold is refused: the schema Codex is given must be the
 * reviewed one, not an approximation of it.
 * @param value - The reviewed schema value.
 * @returns The same value as plain JSON.
 * @throws {TypeError} When the schema holds something JSON cannot represent.
 */
function coordinatorJsonValue(value: unknown): CoordinatorJsonValue {
	if (value === null || JSON_SCALARS.has(typeof value)) {
		return jsonScalar(value);
	}
	if (Array.isArray(value)) {
		return value.map(coordinatorJsonValue);
	}
	if (typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [key, coordinatorJsonValue(child)]),
		);
	}
	throw new TypeError("Coordinator tool schemas must contain JSON values.");
}

/** The scalar types a JSON schema value may be. */
const JSON_SCALARS: ReadonlySet<string> = new Set(["boolean", "string", "number"]);

/**
 * One scalar schema value, refusing a number JSON cannot hold.
 * @param value - The scalar, already known to be null or a JSON scalar type.
 * @returns The same value.
 * @throws {TypeError} When the value is a non-finite number.
 */
function jsonScalar(value: unknown): null | boolean | number | string {
	if (typeof value === "number") {
		return finiteJsonNumber(value);
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preceding scalar classification establishes this union
	return value as null | boolean | string;
}

/**
 * A number that JSON can hold, refusing the ones it cannot.
 * @param value - The number.
 * @returns The same number.
 * @throws {TypeError} When the number is not finite.
 */
function finiteJsonNumber(value: number): number {
	if (Number.isFinite(value)) {
		return value;
	}
	throw new TypeError("Coordinator tool schemas must contain finite JSON numbers.");
}

/**
 * The two reviewed tool namespaces a coordinator thread is started with, in reviewed order.
 * @returns The dynamic tools for thread/start.
 */
function coordinatorDynamicTools(): NonNullable<CoordinatorThreadStartParams["dynamicTools"]> {
	return [
		namespaceForThreadStart(WORKHORSE_TOOL_NAMESPACE),
		namespaceForThreadStart(VOICE_TOOL_NAMESPACE),
	];
}

export { coordinatorDynamicTools };

const RESERVED_NAMESPACES = [...coordinatorDynamicTools(), COORDINATOR_CALLBACK_NAMESPACE];
/**
 * Identify a namespace whose descriptor belongs to the workbench.
 * @param name The namespace name.
 * @returns Whether the name is reserved by the runtime.
 */
function isReservedWorkbenchNamespace(name: string): boolean {
	return RESERVED_NAMESPACES.some((namespace) => namespace.name === name);
}
/**
 * Reject a modified reserved descriptor, even when its supplied hash matches it.
 * @param tool The declared namespace or tool.
 */
function assertReservedNamespace(tool: ThreadStartDynamicTool): void {
	const canonical = RESERVED_NAMESPACES.find((namespace) => namespace.name === tool.name);
	if (canonical !== undefined && !isDeepStrictEqual(tool, canonical))
		throw new TypeError("A host profile cannot modify a workbench coordination namespace.");
}
/**
 * Bind unique tool names and canonical reserved descriptors to the known role.
 * @param tools The exact tool descriptors in the profile.
 * @param role The known role, when its built-ins must be present.
 */
function assertWorkbenchThreadTools(
	tools: readonly ThreadStartDynamicTool[],
	role?: "coordinator" | "workhorse",
): void {
	const names = new Set<string>();
	for (const tool of tools) {
		if (names.has(tool.name))
			throw new TypeError("A workbench profile cannot declare duplicate tool names.");
		names.add(tool.name);
		assertReservedNamespace(tool);
	}
	if (role === undefined) return;
	const required =
		role === "coordinator" ? coordinatorDynamicTools() : [COORDINATOR_CALLBACK_NAMESPACE];
	const reservedNames = new Set([...names].filter(isReservedWorkbenchNamespace));
	if (!isDeepStrictEqual(reservedNames, new Set(required.map((tool) => tool.name))))
		throw new TypeError(`The ${role} profile must declare exactly its coordination namespaces.`);
}
export { assertWorkbenchThreadTools, isReservedWorkbenchNamespace };
