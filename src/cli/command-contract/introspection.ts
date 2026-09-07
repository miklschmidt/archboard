import { z } from "zod";
import type { AnyCommandContract } from "@/cli/command-contract/contract";

interface RegistryContractEntry {
	name: string;
	classification: "board" | "browser" | "neither";
	contract: AnyCommandContract;
}

/**
 * Renders a Zod schema as JSON Schema for the published proof, saying so
 * plainly when a schema has no JSON Schema form rather than failing generation.
 * @param schema - The schema to render.
 * @param io - Whether to render the schema as it accepts input or produces output.
 * @returns The JSON Schema, or a placeholder describing why there is none.
 */
function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output"): unknown {
	try {
		return z.toJSONSchema(schema, { io, unrepresentable: "any" });
	} catch {
		return { type: "unknown", description: "Schema cannot be represented as JSON Schema" };
	}
}

/** What makes a registry entry runnable: a command path, and a handler to run. */
const executableContractSchema = z.object({
	path: z.array(z.string()).min(1),
	handler: z.custom<AnyCommandContract["handler"]>((value) => typeof value === "function"),
});

/**
 * Refuses a registry entry that cannot run. The registry's type promises every
 * entry carries a contract, so this checks the value rather than the type: an
 * entry assembled wrongly is exactly what it is here to catch.
 * @param name - The registry name, for the refusal.
 * @param contract - The entry's contract, taken as the value it actually is.
 * @throws {Error} When the entry carries no runnable contract.
 */
function assertExecutableContract(name: string, contract: unknown): void {
	if (!executableContractSchema.safeParse(contract).success) {
		throw new Error(`${name}: registry entry has no executable command contract`);
	}
}

/**
 * Projects the registry into the public description of every command: what it
 * is for, what it accepts, what it publishes, and what it needs. This is the
 * only reader of contract metadata, so the generated proof and any other
 * caller describe commands the same way.
 * @param entries - The registry entries to describe.
 * @returns One public description per entry, in registry order.
 * @throws {Error} When an entry carries no executable command contract.
 */
function introspectContracts(entries: readonly RegistryContractEntry[]) {
	return entries.map(({ name, classification, contract }) => {
		assertExecutableContract(name, contract);
		return {
			name,
			classification,
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

export { type RegistryContractEntry, introspectContracts };
