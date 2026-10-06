// The code facts of Terraform and OpenTofu (ADR 0046, TASK-367.17), read from
// the fixture configuration `fixtures/terraform-shop`: definitions with their
// addresses, references in expressions, module calls resolved to their
// directories, and one root module's address space across its local modules,
// with a plan JSON filling in the remote module the check does not read.
//
// The configuration: the root module `infra` declares a function, its role, a
// policy document, a dead-letter queue, locals, variables and an output. It
// calls the local module `modules/queue`, whose queue takes the dead-letter
// queue through a variable and gives its URL back through an output, and the
// remote module `terraform-aws-modules/vpc/aws` as `network`. `infra/plan.json`
// is a plan JSON written by hand to the format `terraform show -json` writes.

import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createCodeFacts,
	findSymbol,
	readTerraformPlan,
	terraformConfiguration,
	type SyntaxFacts,
	type TerraformPlan,
} from "@/runtime/code-facts/index";
import { fixtureDirectory } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureDirectory("terraform-shop");
const facts = createCodeFacts();
const PLAN_TEXT = readFileSync(
	join(import.meta.dir, "fixtures", "terraform-shop", "infra", "plan.json"),
	"utf8",
);

afterAll(() => {
	checkout.remove();
});

/**
 * Read one Terraform file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function terraform(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "terraform") throw new Error(`${relative} was not read as Terraform`);
	return read;
}

/**
 * The address space of the root module `infra` in a pass of its own.
 * @param plans The plans named for the pass.
 * @returns The configuration.
 */
function infra(plans: readonly TerraformPlan[] = []) {
	return terraformConfiguration(facts.pass(new AbortController().signal, plans), checkout, "infra");
}

/** The fixture's plan, as the check reads it for the root module `infra`. */
const plan: TerraformPlan = {
	checkoutRoot: checkout.root,
	path: "infra/plan.json",
	module: "infra",
	configuration: readTerraformPlan(PLAN_TEXT),
};

test("resources, data sources, module calls and their arguments, variables, outputs and locals are definitions with their addresses", async () => {
	const declared = async (file: string) =>
		Object.fromEntries(
			(await terraform(file)).definitions.map((each) => [
				each.symbol,
				[each.visibility, each.exposed],
			]),
		);
	expect(await declared("infra/main.tf")).toEqual({
		"local.name": ["local", false],
		"local.tags": ["local", false],
		"data.aws_iam_policy_document.assume": ["data", false],
		"aws_iam_role.api": ["resource", false],
		"aws_lambda_function.api": ["resource", false],
		"module.queue": ["module", false],
		"module.queue.var.name": ["argument", false],
		"module.queue.var.dead_letter": ["argument", false],
		"module.network": ["module", false],
		"module.network.var.name": ["argument", false],
		"aws_sqs_queue.dead": ["resource", false],
	});
	// A module's variables and outputs are its interface.
	expect(await declared("infra/modules/queue/variables.tf")).toMatchObject({
		"var.name": ["variable", true],
		"var.dead_letter": ["variable", true],
	});
	expect(await declared("infra/outputs.tf")).toEqual({ "output.api_arn": ["output", true] });
	const main = await terraform("infra/main.tf");
	expect(main.definitions.find((each) => each.symbol === "aws_lambda_function.api")).toMatchObject({
		start: 25,
		end: 42,
	});
});

test("each address an expression names is a configured-path reference, and comments, bound names, provider and ignore_changes arguments and moved blocks are none", async () => {
	const main = await terraform("infra/main.tf");
	const named = new Set(main.references.map((each) => each.symbol));
	expect(main.references.every((each) => each.kind === "configured-path")).toBe(true);
	for (const address of [
		"aws_iam_role.api",
		"data.aws_iam_policy_document.assume",
		"module.queue.url",
		"module.network.private_subnets",
		"local.name",
		"var.region",
		"aws_sqs_queue.dead",
	]) {
		expect(named).toContain(address);
	}
	// A comment, the attributes ignore_changes names and the addresses a moved block refactors.
	for (const address of ["aws_s3_bucket.logs", "tags.Owner", "aws_sqs_queue.old"]) {
		expect(named).not.toContain(address);
	}
	expect(main.references.find((each) => each.symbol === "aws_iam_role.api")?.line).toBe(27);
	const queue = await terraform("infra/modules/queue/main.tf");
	// The variable of a for expression and the iterator of a dynamic block are no addresses.
	expect(queue.references.map((each) => each.symbol).toSorted()).toEqual(
		[
			"aws_sqs_queue.this",
			"var.dead_letter",
			"var.dimensions",
			"var.name",
			"var.topics",
		].toSorted(),
	);
});

test("a module call with a local source resolves to its directory, and a remote one to nothing", async () => {
	const main = await terraform("infra/main.tf");
	expect(main.imports.map((each) => [each.specifier, each.names[0]?.local, each.resolved])).toEqual(
		[
			["./modules/queue", "module.queue", "infra/modules/queue"],
			["terraform-aws-modules/vpc/aws", "module.network", undefined],
		],
	);
});

test("a Terraform address is found whole, never by its last name", async () => {
	const main = await terraform("infra/main.tf");
	expect(findSymbol(main, "aws_iam_role.api[0]", "definition")).toMatchObject({
		status: "found",
		line: 20,
	});
	expect(findSymbol(main, "api", "definition").status).toBe("absent");
	expect(findSymbol(main, "module.queue.url", "definition-or-reference")).toMatchObject({
		line: 31,
	});
});

test("a root module's address space spans its local modules, and a remote module's addresses are unread without a plan", async () => {
	const configuration = await infra();
	expect(configuration.declared("module.queue.aws_sqs_queue.this")).toMatchObject({
		status: "found",
		site: { path: "infra/modules/queue/main.tf", definition: { start: 1, end: 6 } },
	});
	// The root module declares no aws_sqs_queue.this of its own.
	expect(configuration.declared("aws_sqs_queue.this").status).toBe("absent");
	expect(configuration.declared("aws_s3_bucket.logs").status).toBe("absent");
	expect(configuration.declared("module.network.aws_vpc.this")).toEqual({
		status: "unread",
		module: "module.network",
	});
});

test("a declaration reaches another through variables, module arguments and outputs, and a reference into an unread module reaches the module call", async () => {
	const configuration = await infra();
	const reached = (address: string) =>
		Object.fromEntries(
			configuration
				.reached(address)
				.map(({ to, link }) => [to.address, `${link.symbol} ${link.path}:${link.line}`]),
		);
	expect(reached("aws_lambda_function.api")).toEqual({
		"aws_iam_role.api": "aws_iam_role.api infra/main.tf:27",
		"module.queue.aws_sqs_queue.this": "module.queue.url infra/main.tf:31",
		"module.network": "module.network.private_subnets infra/main.tf:35",
	});
	// Through the module's variable to what the calling module's argument names.
	expect(reached("module.queue.aws_sqs_queue.this")).toEqual({
		"aws_sqs_queue.dead": "var.dead_letter infra/modules/queue/main.tf:4",
	});
});

test("a plan JSON gives only addresses and references, and fills in the remote module while the configuration on disk decides the local one", async () => {
	const kept = JSON.stringify(plan.configuration, (_key, value: unknown) =>
		value instanceof Map ? [...value] : value,
	);
	expect(kept).toContain("aws_subnet.private");
	expect(kept).not.toContain("plan-secret-value");
	expect(kept).not.toContain("10.0.0.0/16");
	expect(kept).not.toContain("aws_secret.from_state");
	const configuration = await infra([plan]);
	expect(configuration.declared("module.network.aws_subnet.private[0]")).toMatchObject({
		status: "found",
		// The checkout holds the instance in the module call's block.
		site: { path: "infra/main.tf", definition: { symbol: "module.network" } },
	});
	// The plan's queue module is older than the files: the files decide.
	expect(configuration.declared("module.queue.aws_sqs_queue.stale").status).toBe("absent");
	const reached = configuration.reached("aws_lambda_function.api").map(({ to }) => to.address);
	expect(reached).toContain("module.network.aws_subnet.private");
	expect(reached).not.toContain("module.network");
	expect(configuration.reached("module.network.aws_subnet.private")).toEqual([
		{
			to: expect.objectContaining({ address: "module.network.aws_vpc.this" }),
			link: expect.objectContaining({
				path: "infra/plan.json",
				line: 1,
				symbol: "aws_vpc.this.id",
			}),
		},
	]);
	expect(() => readTerraformPlan('{"format_version":"1.2"}')).toThrow();
	expect(() => readTerraformPlan("not json")).toThrow();
});
