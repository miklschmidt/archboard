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
import { fixtureCheckout, fixtureDirectory } from "@/runtime/code-facts/tests/checkout";

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

test("each address an expression names is a reference, and comments, bound names, provider and ignore_changes arguments and moved blocks are none", async () => {
	const main = await terraform("infra/main.tf");
	// The name of an environment value the function sets is no address (TASK-367.23).
	const written = main.references.filter((each) => each.via === "code");
	const named = new Set(written.map((each) => each.symbol));
	// What each proves is its provider's rule (terraform-providers.test.ts).
	expect(written.every((each) => each.kind !== undefined)).toBe(true);
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

/**
 * Each reference that is an argument's whole value, and the argument.
 * @param read A file's facts.
 * @returns The references' addresses and arguments.
 */
function whole(read: SyntaxFacts): (string | undefined)[][] {
	return read.references.flatMap((each) => (each.whole ? [[each.symbol, each.argument]] : []));
}

test("a reference names the argument it sits in, and says when it is the argument's whole value", async () => {
	const queue = await terraform("infra/modules/queue/main.tf");
	// A dynamic block's for_each is named by its label; a meta-argument is an argument too.
	expect(whole(queue)).toEqual([
		["var.name", "name"],
		["var.dimensions", "dimension.for_each"],
	]);
	// var.dead_letter sits in an object, and var.topics in a for expression.
	const argument = (symbol: string) => queue.references.find((each) => each.symbol === symbol);
	expect(argument("var.dead_letter")).toMatchObject({ argument: "redrive_policy" });
	expect(argument("var.dead_letter")?.whole).toBeUndefined();
	expect(argument("var.topics")).toMatchObject({ argument: "alarm_actions" });
	// An argument of a nested block is named by its path; an attribute after the address is an expression around it.
	const main = whole(await terraform("infra/main.tf"));
	expect(main).toContainEqual(["module.network.private_subnets", "vpc_config.subnet_ids"]);
	expect(main.some(([symbol]) => symbol === "aws_iam_role.api")).toBe(false);
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

test("a module call the check does not read reaches what its arguments name, and a splat over a module's instances reaches its output", async () => {
	const written = fixtureCheckout({
		"main.tf": [
			'module "worker" {',
			'  source = "git::https://example.com/worker.git"',
			"  queue  = aws_sqs_queue.jobs.url",
			"}",
			'module "topics" {',
			'  source = "./topics"',
			"  count  = 2",
			"}",
			'resource "aws_sqs_queue" "jobs" {',
			"  policy = module.topics[*].arn",
			"}",
		].join("\n"),
		"topics/main.tf":
			'resource "aws_sns_topic" "this" {}\noutput "arn" {\n  value = aws_sns_topic.this.arn\n}\n',
	});
	const configuration = await terraformConfiguration(
		facts.pass(new AbortController().signal),
		written,
		"",
	);
	const reached = (address: string) =>
		configuration.reached(address).map(({ to, link }) => `${to.address} ${link.path}:${link.line}`);
	expect(reached("module.worker")).toEqual(["aws_sqs_queue.jobs main.tf:3"]);
	expect(reached("aws_sqs_queue.jobs")).toEqual(["module.topics.aws_sns_topic.this main.tf:10"]);
	written.remove();
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
				// The address, as a file's reference gives it: never an attribute or an index key of the plan's.
				symbol: "aws_vpc.this",
			}),
		},
	]);
	expect(() => readTerraformPlan('{"format_version":"1.2"}')).toThrow();
	expect(() => readTerraformPlan("not json")).toThrow();
});
