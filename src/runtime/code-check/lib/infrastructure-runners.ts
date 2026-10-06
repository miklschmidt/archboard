// Every reader of infrastructure that runs code (ADR 0046, TASK-367.23): one
// for each adapter whose declarations set environment values for the code
// they run. The join across a network hop (environment-join.ts) reads them
// all the same way, so an adapter joins it with one line here.

import { composeRunners } from "@/runtime/code-check/lib/compose-runners";
import type { Runner } from "@/runtime/code-check/lib/environment-join";
import type { PartCode } from "@/runtime/code-check/lib/part-code";
import { kubernetesRunners } from "@/runtime/code-check/lib/kubernetes-runners";
import { terraformRunners } from "@/runtime/code-check/lib/terraform-runners";
import type { FactsPass } from "@/runtime/code-facts/index";

/**
 * The runners every infrastructure reader finds for one board: compose
 * services, Terraform and OpenTofu resources, then Kubernetes workloads.
 * @param codes Each part's bound code, by its id.
 * @param facts The pass.
 * @returns The runners.
 */
async function infrastructureRunners(
	codes: ReadonlyMap<string, PartCode>,
	facts: FactsPass,
): Promise<Runner[]> {
	return [
		...(await composeRunners(codes, facts)),
		...(await terraformRunners(codes, facts)),
		...(await kubernetesRunners(codes, facts)),
	];
}

export { infrastructureRunners };
