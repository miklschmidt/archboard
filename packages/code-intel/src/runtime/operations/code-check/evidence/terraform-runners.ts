// The runners that Terraform and OpenTofu root modules declare (ADR 0046,
// TASK-367.23): each resource that sets environment values for the code it
// runs, such as a Lambda function's `environment { variables = { ... } }`,
// for the join across a network hop (environment-join.ts).
//
// A resource's files never say which directory of code it runs: a function's
// archive and a container's image are built elsewhere. So a resource runs the
// code of the parts drawn inside a part bound to its address, or to an
// address that holds it, such as the module call `module.worker`. The check
// reads the root modules that the board's parts bind, as the Terraform
// evidence does.
//
// A value a resource sets reaches what its references reach, through every
// variable, module argument, output and local value on the way: the parts
// drawn inside a part bound to the declaration at the end, whose code it runs
// (each a candidate where they are several, environment-join.ts), else the
// parts that own it, as Terraform evidence owns it (terraform-evidence.ts).

import {
	partsByRepo,
	runningParts,
	type Runner,
} from "#runtime/operations/code-check/evidence/environment-join.ts";
import type { PartCode, ReadPart } from "#runtime/operations/code-check/part-code.ts";
import { ownershipIn } from "#runtime/operations/code-check/evidence/terraform-evidence.ts";
import {
	terraformConfiguration,
	type TerraformConfiguration,
} from "#runtime/operations/code-facts/terraform/terraform-configuration.ts";
import { type FactsPass } from "#runtime/services/code-facts/reader.ts";

/**
 * The environment names a resource's block sets.
 * @param declaration The resource.
 * @param facts The pass.
 * @param checkout The root module's checkout.
 * @returns Each name and its line; none for a declaration that is no resource the checkout declares.
 */
async function namesSet(
	declaration: TerraformConfiguration["endpoints"][number],
	facts: FactsPass,
	checkout: ReadPart["checkout"],
): Promise<{ readonly symbol: string; readonly line: number }[]> {
	const { kind, path, definition } = declaration;
	if (kind !== "resource" || path === undefined || definition === undefined) return [];
	const found = await facts.read(checkout, path);
	if (found?.adapter !== "terraform") return [];
	return found.references.filter(
		({ via, line }) => via === "environment" && definition.start <= line && line <= definition.end,
	);
}

/**
 * The runners of one root module.
 * @param codes Each part's bound code, by its id.
 * @param configuration The root module's address space.
 * @param parts The read parts of the board in its checkout.
 * @param facts The pass.
 * @returns One runner per resource that sets an environment value.
 */
async function runnersIn(
	codes: ReadonlyMap<string, PartCode>,
	configuration: TerraformConfiguration,
	parts: readonly [ReadPart, ...ReadPart[]],
	facts: FactsPass,
): Promise<Runner[]> {
	const { checkout } = parts[0];
	const ownersAt = ownershipIn(configuration, parts);
	const boundAt = ownershipIn(
		configuration,
		parts.filter((part) => part.root === configuration.root && part.grain.kind === "symbol"),
	);
	const runners: Runner[] = [];
	for (const declaration of configuration.endpoints) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the root module's files are cached by now
		const names = await namesSet(declaration, facts, checkout);
		if (names.length === 0) continue;
		const { address, path = "" } = declaration;
		const reached = configuration.reached(address);
		runners.push({
			repo: checkout.repo,
			directories: [],
			parts: boundAt(address),
			settings: names.map(({ symbol, line }) => ({
				name: symbol,
				repo: checkout.repo,
				path,
				line,
				reaches: reached.flatMap(({ to, link }) =>
					link.path === path && link.line === line
						? [runningParts(codes, ownersAt(to.address))]
						: [],
				),
			})),
		});
	}
	return runners;
}

/**
 * The runners the root modules that the parts of a board bind declare.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @returns The runners.
 */
async function terraformRunners(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
): Promise<Runner[]> {
	const runners: Runner[] = [];
	for (const parts of partsByRepo(codes)) {
		for (const root of [...new Set(parts.flatMap((part) => part.root ?? []))].toSorted()) {
			// oxlint-disable-next-line no-await-in-loop -- one root module at a time, in order
			const configuration = await terraformConfiguration(facts, parts[0].checkout, root);
			// oxlint-disable-next-line no-await-in-loop -- one root module at a time, in order
			runners.push(...(await runnersIn(codes, configuration, parts, facts)));
		}
	}
	return runners;
}

export { terraformRunners };
