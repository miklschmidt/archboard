import type { z } from "zod";

import type {
	CodexIngressConformance,
	CodexOutputConformance,
} from "#shared/protocol/app-server-contract.ts";

type SchemaConformance<Wire, Schema extends z.ZodType> = Schema &
	CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>;

/**
 * Proves every handwritten ingress schema against its normalized generated wire type.
 * @returns An identity validator whose parameter enforces every method's wire conformance.
 */
export function codexIngressSchemas<WireByMethod extends object>() {
	return <Schemas extends { [Method in keyof WireByMethod]: z.ZodType }>(
		schemas: Schemas & {
			[Method in keyof WireByMethod]: SchemaConformance<WireByMethod[Method], Schemas[Method]>;
		},
	): Schemas => schemas;
}

/**
 * Proves a handwritten schema for a value the client sends to Codex against the generated
 * wire type, so a protocol bump fails at type-check rather than on the wire.
 * @returns An identity function that only accepts a schema whose output conforms to the wire type.
 */
export function codexOutputSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexOutputConformance<Wire, z.output<Schema>>,
	): Schema => schema;
}

/**
 * Proves a handwritten schema for a value the client receives from Codex against the generated
 * wire type in both its input and output shapes.
 * @returns An identity function that only accepts a schema conforming to the wire type.
 */
export function codexIngressSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>,
	): Schema => schema;
}
