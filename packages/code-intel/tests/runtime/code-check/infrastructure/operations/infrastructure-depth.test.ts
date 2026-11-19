// The code pass counts the exports of a bound Terraform module, Nix flake and
// Helm chart by kind, beside the other languages (TASK-646.13). It counts each
// name a caller sets or reads: a Terraform variable or output, a flake output
// at the end of its attribute path, a chart value at the end of its key path.
// A path that only groups others, such as `packages.x86_64-linux` or `image`,
// is no export of its own. It judges none of them: a caller reads an output or
// a value by design, and Terraform keeps its own rules.
//
// The checkout `shop` holds the shallow module `modules/bucket`, which wraps
// one bucket and passes its two variables through, and which the root module
// `infra` calls and reads an output of; a flake that gives a function in
// `lib` and a package per system; and a chart with nested values.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-infrastructure-depth-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;

/**
 * A part bound to a path of the checkout.
 * @param id Its id.
 * @param path Its bound path.
 * @param order Its order.
 * @returns The node.
 */
function part(id: string, path: string, order: number) {
	return { id, name: id, kind: "module", order, binding: { repo: SHOP, path } };
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
			"}",
			'variable "bucket" {}',
			'variable "force_destroy" {}',
			'output "arn" {',
			"  value = aws_s3_bucket.this.arn",
			"}",
			"",
		].join("\n"),
		"infra/main.tf": [
			'module "bucket" {',
			'  source        = "../modules/bucket"',
			'  bucket        = "shop-assets"',
			"  force_destroy = true",
			"}",
			'output "assets" {',
			"  value = module.bucket.arn",
			"}",
			"",
		].join("\n"),
		"flake.nix": [
			"{",
			"  outputs = { self }: {",
			"    lib.greet = name: name;",
			'    packages.x86_64-linux.cli = "cli";',
			'    packages.aarch64-linux.cli = "cli";',
			"  };",
			"}",
			"",
		].join("\n"),
		"chart/Chart.yaml": "apiVersion: v2\nname: cart\nversion: 1.0.0\n",
		"chart/values.yaml": "replicas: 2\nimage:\n  repository: cart\n  tag: stable\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the infrastructure");
	register(scratch, { [SHOP]: shop });
	document(vault, "Infra", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Root", "infra", 10),
					part("Assets", "modules/bucket", 20),
					part("Flake", "flake.nix", 30),
					part("Cart", "chart/Chart.yaml", 40),
				],
				edges: [],
				flows: [],
			},
		},
	]);
	const check: typeof CheckModule = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	outcome = await check.checkCode(vault, read.states, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("a Terraform module, a flake and a chart show their exports by kind, each name at the end of its path", () => {
	const depth = new Map(outcome.depth.map((each) => [each.subject.name, each]));
	const none = { functions: 0, classes: 0, methods: 0, values: 0, types: 0 };
	// Two variables and an output.
	expect(depth.get("Assets")).toMatchObject({
		languages: ["terraform"],
		exports: { ...none, values: 3 },
	});
	// lib.greet is a function; the package of each system is a value.
	expect(depth.get("Flake")).toMatchObject({
		languages: ["nix"],
		exports: { ...none, functions: 1, values: 2 },
	});
	// replicas, image.repository and image.tag; image only groups two of them.
	expect(depth.get("Cart")).toMatchObject({
		languages: ["helm"],
		exports: { ...none, values: 3 },
	});
});

test("no infrastructure export is judged by module depth, and Terraform keeps its own shallow-module finding", () => {
	expect(outcome.findings.filter((each) => each.export !== undefined)).toEqual([]);
	const shallow = outcome.findings.filter((each) => each.code === "MODULE_SHALLOW");
	expect(shallow.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Assets", "information"],
	]);
	expect(shallow[0]?.evidence?.map((each) => each.symbol)).toEqual([
		"var.bucket",
		"var.force_destroy",
	]);
});
