// The code pass reads parts bound to Terraform and OpenTofu addresses (ADR
// 0046, TASK-367.17): a binding names an address of the root module its path
// names, a reference that joins two bound declarations is evidence of the
// kind its provider's rules give it (TASK-367.18), and a plan JSON an agent
// names fills in the remote module the check does not read. The check never reads state, variable files or
// `.terraform`, never runs `terraform` or `tofu`, and never quotes a value.
//
// The checkout `shop` holds the root module `infra`, which calls the local
// module `modules/queue` and the remote module `network`. It tracks, as a
// careless repository might, Terraform state, a variable file and the
// `.terraform` directory, each with a secret, and a plan JSON that Git
// ignores lies beside them. `terraform` and `tofu` on the PATH are stand-ins
// that leave a mark when anything runs them.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
	PATH: process.env["PATH"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-terraform-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
const ran = join(scratch, "ran");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const SECRETS = [
	"state-secret",
	"tfvars-secret",
	"dot-terraform-secret",
	"plan-secret",
	"source-secret",
];
/** The remote module's source, with a credential in it that nothing quotes. */
const NETWORK = "git::https://ci:source-secret@example.com/network.git";
let check: typeof CheckModule;
let withoutPlan: CodeCheckOutcome;
let withPlan: CodeCheckOutcome;

/**
 * A part bound to an address of the root module `infra`.
 * @param id Its id.
 * @param name Its name.
 * @param symbol Its address.
 * @param path Its bound path.
 * @returns The node.
 */
function part(id: string, name: string, symbol: string, path = "infra") {
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * A relationship with no anchor.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @param kind Its kind.
 * @returns The relationship.
 */
function edge(id: string, from: string, to: string, kind: string) {
	return { id, order: Number(id.slice(1)) * 10, from, to, kind };
}

/** The plan JSON `terraform show -json` would write for `infra`, with values it must never quote. */
const PLAN = {
	format_version: "1.2",
	variables: { token: { value: "plan-secret" } },
	planned_values: { root_module: { resources: [{ values: { tags: { s: "plan-secret" } } }] } },
	configuration: {
		root_module: {
			module_calls: {
				network: {
					source: NETWORK,
					module: {
						resources: [
							{ mode: "managed", type: "aws_vpc", name: "this", expressions: {} },
							{
								mode: "managed",
								type: "aws_subnet",
								name: "private",
								expressions: {
									vpc_id: { references: ["aws_vpc.this.id", "aws_vpc.this"] },
									tags: { constant_value: { s: "plan-secret" } },
								},
							},
						],
						outputs: {
							private_subnets: { expression: { references: ["aws_subnet.private"] } },
							vpc_id: { expression: { references: ["aws_vpc.this.id", "aws_vpc.this"] } },
						},
					},
				},
			},
		},
	},
};

beforeAll(async () => {
	mkdirSync(join(scratch, "bin"), { recursive: true });
	for (const program of ["terraform", "tofu"]) {
		writeFileSync(join(scratch, "bin", program), `#!/bin/sh\ntouch "${ran}"\n`);
		chmodSync(join(scratch, "bin", program), 0o755);
	}
	process.env["PATH"] = `${join(scratch, "bin")}:${caller.PATH ?? ""}`;
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		".gitignore": "plan.json\n",
		// A file read as text that names a missing address never stands in for its declaration.
		"infra/README.md": "The bucket aws_s3_bucket.logs is gone.\n",
		"infra/main.tf": [
			'resource "aws_iam_role" "api" {',
			'  name = "api"',
			"}",
			"",
			'resource "aws_lambda_function" "api" {',
			"  role = aws_iam_role.api.arn",
			"  environment {",
			"    variables = {",
			"      QUEUE_URL    = module.queue.url",
			"      DEAD_LETTERS = aws_sqs_queue.dead.url",
			"      VPC_ID       = module.network.vpc_id",
			"    }",
			"  }",
			"  vpc_config {",
			"    subnet_ids = module.network.private_subnets",
			"  }",
			"}",
			"",
			'module "queue" {',
			'  source      = "./modules/queue"',
			"  dead_letter = aws_sqs_queue.dead.arn",
			"}",
			"",
			'module "network" {',
			`  source = "${NETWORK}"`,
			"}",
			"",
			'resource "aws_sqs_queue" "dead" {',
			'  name = "dead"',
			"}",
			"",
		].join("\n"),
		"infra/modules/queue/main.tf": [
			'variable "dead_letter" {}',
			"",
			'resource "aws_sqs_queue" "this" {',
			"  redrive_policy = var.dead_letter",
			"}",
			"",
			'output "url" {',
			"  value = aws_sqs_queue.this.url",
			"}",
			"",
		].join("\n"),
		"infra/terraform.tfstate": JSON.stringify({
			resources: [
				{
					type: "aws_secret",
					name: "from_state",
					instances: [{ attributes: { value: "state-secret" } }],
				},
			],
		}),
		"infra/terraform.tfstate.backup": '{"secret":"state-secret"}',
		"infra/prod.tfvars": 'token = "tfvars-secret"\n',
		"infra/.terraform/modules/modules.json":
			'{"Modules":[{"Key":"network","Dir":".terraform/modules/network"}]}',
		"infra/.terraform/modules/network/main.tf":
			'resource "aws_vpc" "this" {\n  tags = { s = "dot-terraform-secret" }\n}\n',
	});
	git(scratch, shop, "add", "-A", "-f");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the configuration");
	write(shop, { "infra/plan.json": JSON.stringify(PLAN) });
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pF", "Function", "aws_lambda_function.api"),
					part("pR", "Role", "aws_iam_role.api"),
					part("pQ", "Queue", "module.queue.aws_sqs_queue.this"),
					part("pD", "Dead letters", "aws_sqs_queue.dead"),
					part("pG", "Gone", "aws_s3_bucket.logs"),
					part("pX", "In state only", "aws_secret.from_state"),
					part("pV", "Network", "module.network.aws_vpc.this"),
					part("pS", "Subnets", "module.network.aws_subnet.private"),
					part("pT", "Downloaded", "aws_vpc.this", "infra/.terraform/modules/network"),
				],
				edges: [
					// The function's environment names the queue's URL, an output of the queue module.
					edge("e1", "pF", "pQ", "queue"),
					// Drawn from the dead letters, while the queue's configuration names them.
					edge("e2", "pD", "pQ", "dependency"),
					// Drawn from the VPC, while the subnets name it; `other` accepts provisioning.
					edge("e3", "pV", "pS", "other"),
				],
			},
		},
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	withoutPlan = await check.checkCode(vault, read.boards, new AbortController().signal);
	const plans = await check.readPlans(
		vault,
		[join(shop, "infra", "plan.json")],
		new AbortController().signal,
	);
	if (!plans.ok) throw new Error(`the plan was refused: ${plans.reason}`);
	withPlan = await check.checkCode(vault, read.boards, new AbortController().signal, plans.plans);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Each finding as its code, its subject and its severity.
 * @param outcome What a pass found.
 * @returns The findings, sorted.
 */
function found(outcome: CodeCheckOutcome): string[] {
	return outcome.findings
		.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`)
		.toSorted();
}

test("a part bound to an address its root module no longer declares is reported, and one inside a remote module is skipped without a plan", () => {
	expect(found(withoutPlan)).toEqual(
		[
			"BINDING_SYMBOL_MISSING pG warning",
			"BINDING_SYMBOL_MISSING pX warning",
			"RELATIONSHIP_BACKWARDS e2 information",
			// The function's environment names the dead letters; the role it runs as only sets it up.
			"RELATIONSHIP_UNDRAWN pD warning",
		].toSorted(),
	);
	const skipped = (reason: string) =>
		withoutPlan.skipped.filter((each) => each.reason === reason).map((each) => each.subject?.id);
	expect(skipped("module-not-read")).toEqual(["pV", "pS"]);
	expect(skipped("path-never-read")).toEqual(["pT"]);
});

test("a reference that joins two resource-bound parts supports their relationship, through a module's output and variable, and one the board does not draw is undrawn", () => {
	const undrawn = withoutPlan.findings.find((each) => each.code === "RELATIONSHIP_UNDRAWN");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "configured-path",
			resolution: "resolved",
			from: "pF",
			to: "pD",
			repo: SHOP,
			path: "infra/main.tf",
			line: 10,
			symbol: "aws_sqs_queue.dead",
		},
	]);
	const backwards = withoutPlan.findings.find((each) => each.subject?.id === "e2");
	expect(
		backwards?.evidence?.map((piece) => [piece.from, piece.to, piece.path, piece.line]),
	).toEqual([["pQ", "pD", "infra/modules/queue/main.tf", 4]]);
	expect(withoutPlan.findings.some((each) => each.subject?.id === "e1")).toBe(false);
});

test("a named plan JSON declares the remote module's addresses and joins them by its references", () => {
	expect(withPlan.skipped.map((each) => each.reason)).not.toContain("module-not-read");
	const undrawn = withPlan.findings.filter((each) => each.code === "RELATIONSHIP_UNDRAWN");
	const pieces = undrawn.flatMap((each) => each.evidence ?? []);
	// Through the plan's output `vpc_id` of the remote module.
	expect(pieces.map((piece) => [piece.from, piece.to, piece.path, piece.line])).toContainEqual([
		"pF",
		"pV",
		"infra/main.tf",
		11,
	]);
	// A reference only the plan names cites the plan.
	const backwards = withPlan.findings.find((each) => each.subject?.id === "e3");
	expect(
		backwards?.evidence?.map((piece) => [piece.from, piece.to, piece.path, piece.line]),
	).toEqual([["pS", "pV", "infra/plan.json", 1]]);
});

const refused = async (named: string) =>
	!(await check.readPlans(vault, [named], new AbortController().signal)).ok;

test("the check never reads state, variable files or .terraform, never runs terraform or tofu, and never quotes a value", async () => {
	const answers = JSON.stringify([withoutPlan, withPlan]);
	for (const secret of SECRETS) expect(answers).not.toContain(secret);
	expect(existsSync(ran)).toBe(false);
	writeFileSync(join(scratch, "elsewhere.json"), JSON.stringify(PLAN));
	// Inside the checkout as named, outside it once its link resolves.
	symlinkSync(join(scratch, "elsewhere.json"), join(shop, "infra", "linked.json"));
	for (const named of [
		join(shop, "infra", "terraform.tfstate"),
		join(shop, "infra", "prod.tfvars"),
		join(scratch, "elsewhere.json"),
		join(shop, "infra", "linked.json"),
		join(shop, "infra", "main.tf"),
		"infra/plan.json",
	]) {
		expect(await refused(named)).toBe(true);
	}
});
