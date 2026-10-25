// The code pass reads a Terraform module's interface (ADR 0044, ADR 0046,
// TASK-368.11): its variables and outputs are what it exposes, a call of it
// uses the variables it sets and the outputs its module reads, a variable it
// passes unchanged to one argument of a resource is a pass-through variable,
// and a module that wraps one resource and passes every variable through is
// shallow. Each is information.
//
// The checkout `shop` holds the shallow module `modules/bucket`, which wraps
// one bucket, passes three variables through and says with a fourth whether to
// create it; the deep module `modules/queue`, which computes a name and a
// retention from its variables and passes only its timeout through; two
// modules that pass every variable through to one resource and are not
// shallow: `modules/alarms`, whose `for_each` carries a variable's data into
// the alarm, and `modules/topic`, whose topic also reads a local; and the root
// module `infra`, which calls all four, reads one output of the queue, passes
// every output of the bucket on through the whole call, and depends on the
// queue.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-terraform-modules-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;
let order = 0;

/**
 * A part bound to a module directory, or to an address in one.
 * @param id Its id.
 * @param path Its bound directory.
 * @param parent The part that holds it, if any.
 * @param symbol Its address, if any.
 * @returns The node.
 */
function part(id: string, path: string, parent?: string, symbol?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: (order += 10),
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
		...(parent === undefined ? {} : { parent }),
	};
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"modules/bucket/main.tf": [
			'resource "aws_s3_bucket" "this" {',
			"  bucket        = var.bucket",
			"  force_destroy = var.force_destroy",
			"  tags          = var.tags",
			"  count         = var.create ? 1 : 0",
			"}",
			"",
		].join("\n"),
		"modules/bucket/variables.tf": [
			'variable "bucket" {',
			"  type = string",
			"  validation {",
			"    condition     = length(var.bucket) > 2",
			'    error_message = "Too short."',
			"  }",
			"}",
			'variable "force_destroy" {',
			"  type    = bool",
			"  default = false",
			"}",
			'variable "tags" {',
			"  type    = map(string)",
			"  default = {}",
			"}",
			'variable "create" {',
			"  default = true",
			"}",
			"",
		].join("\n"),
		"modules/bucket/outputs.tf": [
			'output "arn" {',
			"  value = aws_s3_bucket.this.arn",
			"}",
			'output "id" {',
			"  value = aws_s3_bucket.this.id",
			"}",
			"",
		].join("\n"),
		"modules/queue/main.tf": [
			"locals {",
			'  name = "${var.prefix}-${var.environment}"',
			"}",
			'resource "aws_sqs_queue" "dead" {',
			'  name = "${local.name}-dead"',
			"}",
			'resource "aws_sqs_queue" "this" {',
			"  name                       = local.name",
			"  message_retention_seconds  = var.retention_days * 86400",
			"  visibility_timeout_seconds = var.timeout",
			"  redrive_policy = jsonencode({",
			"    deadLetterTargetArn = aws_sqs_queue.dead.arn",
			"  })",
			"}",
			"",
		].join("\n"),
		"modules/queue/variables.tf": [
			'variable "prefix" {}',
			'variable "environment" {}',
			'variable "retention_days" {}',
			'variable "timeout" {}',
			"",
		].join("\n"),
		"modules/queue/outputs.tf": [
			'output "url" {',
			"  value = aws_sqs_queue.this.url",
			"}",
			'output "dead_arn" {',
			"  value = aws_sqs_queue.dead.arn",
			"}",
			"",
		].join("\n"),
		"modules/alarms/main.tf": [
			'resource "aws_cloudwatch_metric_alarm" "this" {',
			"  for_each   = var.dimensions",
			"  alarm_name = var.alarm_name",
			"  dimensions = each.value",
			"}",
			'variable "dimensions" {}',
			'variable "alarm_name" {}',
			"",
		].join("\n"),
		"modules/topic/main.tf": [
			"locals {",
			'  key = "alias/aws/sns"',
			"}",
			'resource "aws_sns_topic" "this" {',
			"  name              = var.name",
			"  kms_master_key_id = local.key",
			"}",
			'variable "name" {}',
			"",
		].join("\n"),
		"infra/main.tf": [
			'module "bucket" {',
			'  source        = "../modules/bucket"',
			'  bucket        = "shop-assets"',
			"  force_destroy = true",
			"}",
			'module "queue" {',
			'  source         = "../modules/queue"',
			'  prefix         = "shop"',
			'  environment    = "prod"',
			"  retention_days = 4",
			"  timeout        = 30",
			"}",
			'module "alarms" {',
			'  source     = "../modules/alarms"',
			"  dimensions = {}",
			'  alarm_name = "depth"',
			"}",
			'module "topic" {',
			'  source = "../modules/topic"',
			'  name   = "orders"',
			"}",
			'output "bucket" {',
			"  value = module.bucket",
			"}",
			"",
		].join("\n"),
		"infra/api.tf": [
			'resource "aws_lambda_function" "api" {',
			'  function_name = "api"',
			"  environment {",
			"    variables = {",
			"      BUCKET = module.bucket.arn",
			"      QUEUE  = module.queue.url",
			"    }",
			"  }",
			"  depends_on = [module.queue]",
			"}",
			"",
		].join("\n"),
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the configuration");
	register(scratch, { [SHOP]: shop });
	board(vault, "Infra", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("API", "infra", undefined, "aws_lambda_function.api"),
					part("Assets", "modules/bucket"),
					part("Bucket", "modules/bucket", "Assets", "aws_s3_bucket.this"),
					part("Jobs", "modules/queue"),
					part("Queue", "modules/queue", "Jobs", "aws_sqs_queue.this"),
					part("Dead", "modules/queue", "Jobs", "aws_sqs_queue.dead"),
					part("Alarms", "modules/alarms"),
					part("Alarm", "modules/alarms", "Alarms", "aws_cloudwatch_metric_alarm.this"),
					part("Topics", "modules/topic"),
					part("Topic", "modules/topic", "Topics", "aws_sns_topic.this"),
				],
				edges: [
					{ id: "e1", order: 10, from: "API", to: "Bucket", kind: "data" },
					{ id: "e2", order: 20, from: "API", to: "Queue", kind: "queue" },
				],
				flows: [],
			},
		},
	]);
	const check: typeof CheckModule = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The findings of one code.
 * @param code The finding's code.
 * @returns Each finding.
 */
function findings(code: string) {
	return outcome.findings.filter((each) => each.code === code);
}

test("a module's variables and outputs are what it exposes, and a call uses the variables it sets and the outputs its module reads, every one through the whole call but in depends_on", () => {
	const unused = findings("EXPOSED_UNUSED");
	expect(unused.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Assets", "information"],
		["Jobs", "information"],
	]);
	const [assets, jobs] = unused.map((each) => each.message);
	// The call sets bucket and force_destroy, and an output passes the whole call on; nothing sets tags or create.
	for (const name of ["var.tags", "var.create"]) expect(assets).toContain(name);
	for (const name of ["var.bucket", "var.force_destroy", "output.arn", "output.id"]) {
		expect(assets).not.toContain(name);
	}
	// The function reads url, and its depends_on on the whole call reads no output.
	expect(jobs).toContain("output.dead_arn");
	expect(jobs).not.toContain("output.url");
	expect(jobs).not.toContain("var.timeout");
	expect(outcome.skipped.some((each) => each.reason === "exposure-unknown")).toBe(false);
});

test("a caller reaches a module's resource only through an output, so no entry point is reported unexposed", () => {
	expect(findings("ENTRY_POINT_UNEXPOSED")).toEqual([]);
});

test("a module that wraps one resource and passes every variable through, but the one that only sets its count, is shallow, with each variable's one use as evidence", () => {
	const shallow = findings("MODULE_SHALLOW");
	// Alarms' for_each carries var.dimensions into the alarm, and Topics' topic reads a local.
	expect(shallow.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Assets", "information"],
	]);
	expect(shallow[0]?.message).toContain("var.create");
	// A use inside the variable's own validation is no use, and count is no argument of the bucket.
	expect(shallow[0]?.evidence?.map(({ path, line, symbol }) => [path, line, symbol])).toEqual([
		["modules/bucket/main.tf", 2, "var.bucket"],
		["modules/bucket/main.tf", 3, "var.force_destroy"],
		["modules/bucket/main.tf", 4, "var.tags"],
	]);
	// The shallow finding names every variable, so none is reported again.
	expect(findings("VARIABLE_PASSED_THROUGH").some((each) => each.subject?.id === "Assets")).toBe(
		false,
	);
});

test("a module that is not shallow names the variables it passes unchanged to one argument as pass-through variables", () => {
	const passed = findings("VARIABLE_PASSED_THROUGH");
	expect(passed.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Jobs", "information"],
		["Alarms", "information"],
		["Topics", "information"],
	]);
	expect(passed[0]?.evidence).toEqual([
		expect.objectContaining({
			resolution: "resolved",
			repo: SHOP,
			path: "modules/queue/main.tf",
			line: 10,
			symbol: "var.timeout",
		}),
	]);
});
