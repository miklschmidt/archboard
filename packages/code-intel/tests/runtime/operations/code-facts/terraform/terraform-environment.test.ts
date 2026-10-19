// The environment values a Terraform resource sets are references by
// `environment` at the line of their value (ADR 0046, TASK-367.23), where the
// value's own references stand, so the code check can join them with the code
// that reads the name.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"main.tf": [
		'resource "aws_lambda_function" "notify" {',
		"  environment {",
		"    variables = {",
		"      EVENTS_URL = aws_sqs_queue.events.url",
		'      "MODE"     = "fast"',
		"    }",
		"  }",
		"}",
		'resource "google_cloud_run_v2_service" "api" {',
		"  template {",
		"    containers {",
		"      env {",
		'        name  = "DB_HOST"',
		"        value = google_sql_database_instance.db.private_ip_address",
		"      }",
		"    }",
		"  }",
		"}",
		'resource "azurerm_linux_function_app" "jobs" {',
		"  app_settings = { CACHE = azurerm_redis_cache.cache.hostname }",
		"  tags         = { OWNER = var.owner }",
		"}",
		'output "url" { value = { NOT_SET = aws_sqs_queue.events.url } }',
		"",
	].join("\n"),
});

afterAll(() => {
	checkout.remove();
});

test("each name a resource's environment sets is an environment reference at the line of its value", async () => {
	const read = await createCodeFacts().pass(new AbortController().signal).read(checkout, "main.tf");
	if (read?.adapter !== "terraform") throw new Error("main.tf was not read as Terraform");
	const environment = read.references.filter((each) => each.via === "environment");
	expect(environment.map((each) => [each.symbol, each.line])).toEqual([
		["EVENTS_URL", 4],
		["MODE", 5],
		["DB_HOST", 14],
		["CACHE", 20],
	]);
	const addresses = read.references.filter((each) => each.via === "code");
	for (const [line, symbol] of [
		[4, "aws_sqs_queue.events"],
		[14, "google_sql_database_instance.db"],
		[20, "azurerm_redis_cache.cache"],
	] as const) {
		expect(addresses).toContainEqual(expect.objectContaining({ line, symbol }));
	}
});
