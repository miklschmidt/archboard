import type { z } from "zod";

import type { CodexIngressConformance } from "../../../shared/codex-app-server-contract/index.js";

type SchemaConformance<Wire, Schema extends z.ZodType> = Schema &
	CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>;

/** Proves every handwritten ingress schema against its normalized generated wire type. */
export function codexIngressSchemas<WireByMethod extends object>() {
	return <Schemas extends { [Method in keyof WireByMethod]: z.ZodType }>(
		schemas: Schemas & {
			[Method in keyof WireByMethod]: SchemaConformance<WireByMethod[Method], Schemas[Method]>;
		},
	): Schemas => schemas;
}
