import { expect, test } from "bun:test";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { z } from "zod";
import { renderCliContractArtifacts } from "#cli/operations/contract-artifacts/render.ts";
import { cliContractRegistry } from "#cli/operations/invocation/run.ts";

const proofRoutes = z.object({ routes: z.array(z.object({ name: z.string() }).passthrough()) });

// The proof JSON is the CLI's public route table: every route the registry holds, with what the
// registry says about it, and nothing about the handler behind it. Rendering formats through
// oxfmt, which is slow on a cold cache.
test("the proof JSON holds exactly the registry's routes, without their contracts", async () => {
	const { artifacts } = await renderCliContractArtifacts(SOURCE_CHECKOUT);
	const proof = proofRoutes.parse(JSON.parse(artifacts.get("command-contract-proof.json") ?? ""));
	expect(proof.routes).toEqual(
		cliContractRegistry().map(({ contract: _contract, ...route }) => route),
	);
}, 60_000);
