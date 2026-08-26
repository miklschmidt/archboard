import { z } from "zod";
import type { AnyCommandContract } from "./contract.js";

export interface RegistryContractEntry {
	name: string;
	contract: AnyCommandContract;
}

function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output"): unknown {
	try {
		return z.toJSONSchema(schema, { io, unrepresentable: "any" });
	} catch {
		return { type: "unknown", description: "Schema cannot be represented as JSON Schema" };
	}
}

export function introspectContracts(entries: readonly RegistryContractEntry[]) {
	return entries.map(({ name, contract }) => {
		if (!contract || !Array.isArray(contract.path) || typeof contract.handler !== "function") {
			throw new Error(`${name}: registry entry has no executable command contract`);
		}
		return {
			name,
			path: contract.path,
			summary: contract.summary,
			usage: contract.usage,
			description: contract.description,
			examples: contract.examples,
			parameters: contract.parameters,
			input: {
				schema: jsonSchema(contract.input.ingress, "input"),
				stages: (contract.input.stages ?? []).map((stage) => ({
					name: stage.name,
					when: stage.when,
					description: stage.description,
					rules: stage.rules ?? [],
					schema: jsonSchema(stage.schema, "input"),
				})),
			},
			result: jsonSchema(contract.result),
			output: contract.output.cases.map(({ artifact: _artifact, ...outputCase }) => outputCase),
			outcomes: contract.outcomes ?? [],
			prerequisites: contract.prerequisites,
			effects: contract.effects,
			refusals: contract.refusals,
			relationships: contract.relationships,
		};
	});
}
