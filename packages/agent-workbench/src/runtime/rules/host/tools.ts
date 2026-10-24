import {
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_WORKHORSE_NAMESPACE,
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
		namespaceForThreadStart(ARCHBOARD_WORKHORSE_NAMESPACE),
		namespaceForThreadStart(ARCHBOARD_VOICE_NAMESPACE),
	];
}

export { coordinatorDynamicTools };
