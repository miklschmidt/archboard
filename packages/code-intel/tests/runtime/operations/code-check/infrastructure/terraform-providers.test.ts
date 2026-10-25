// The code check under the Terraform rules of the providers the user named
// (ADR 0046, TASK-367.18): one root module per provider, each with a board.
// A joining declaration gives evidence between the two parts it joins, never
// between itself and each end, and an anchor may name it. A provisioning
// reference, such as the role a function runs as, and a grant are never a
// relationship the board does not draw.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";
import type { CodeFinding } from "#shared/protocol/code-check.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-terraform-providers-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;

const AWS = `resource "aws_sqs_queue" "jobs" {}

resource "aws_cloudwatch_log_group" "worker" {}

resource "aws_lambda_function" "worker" {
  role = aws_iam_role.worker.arn
  logging_config {
    log_group = aws_cloudwatch_log_group.worker.name
  }
}

resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn = aws_sqs_queue.jobs.arn
  function_name    = aws_lambda_function.worker.arn
}

resource "aws_lambda_permission" "jobs" {
  function_name = aws_lambda_function.worker.function_name
  source_arn    = aws_sqs_queue.jobs.arn
}

resource "aws_lb" "web" {}

resource "aws_lb_target_group" "web" {}

resource "aws_lb_listener" "web" {
  load_balancer_arn = aws_lb.web.arn
  default_action {
    target_group_arn = aws_lb_target_group.web.arn
  }
}

module "worker" {
  source    = "./modules/worker"
  queue_url = aws_sqs_queue.jobs.url
}
`;

const AWS_WORKER = `variable "queue_url" {}

resource "aws_lambda_function" "this" {
  environment {
    variables = { QUEUE_URL = var.queue_url }
  }
}
`;

// A call of a registry module, which the check does not read: what the module
// does with an argument is unknown, so only an environment value is a path.
const AWS_REMOTE = `resource "aws_vpc" "main" {}

resource "aws_sqs_queue" "jobs" {}

module "worker" {
  source = "terraform-aws-modules/lambda/aws"
  vpc_id = aws_vpc.main.id
  environment_variables = {
    QUEUE_URL = aws_sqs_queue.jobs.url
  }
}
`;

const GOOGLE = `resource "google_pubsub_topic" "orders" {}

resource "google_service_account" "worker" {}

resource "google_cloud_run_v2_service" "api" {}

resource "google_cloudfunctions2_function" "worker" {
  service_config {
    service_account_email = google_service_account.worker.email
  }
  event_trigger {
    pubsub_topic = google_pubsub_topic.orders.id
  }
}

resource "google_pubsub_subscription" "push" {
  topic = google_pubsub_topic.orders.id
  push_config {
    push_endpoint = google_cloud_run_v2_service.api.uri
  }
}
`;

const AZURE = `resource "azurerm_storage_account" "uploads" {}

resource "azurerm_storage_queue" "uploads" {
  storage_account_id = azurerm_storage_account.uploads.id
}

resource "azurerm_linux_function_app" "thumbnails" {
  app_settings = {
    QUEUE = azurerm_storage_queue.uploads.name
  }
}

resource "azurerm_eventgrid_event_subscription" "uploads" {
  scope = azurerm_storage_account.uploads.id
  storage_queue_endpoint {
    queue_name = azurerm_storage_queue.uploads.name
  }
}

resource "azurerm_role_assignment" "reader" {
  scope        = azurerm_storage_account.uploads.id
  principal_id = azurerm_linux_function_app.thumbnails.identity[0].principal_id
}
`;

const KUBERNETES = `resource "kubernetes_namespace" "shop" {}

resource "kubernetes_deployment_v1" "api" {
  metadata {
    namespace = kubernetes_namespace.shop.metadata[0].name
  }
}

resource "kubernetes_service_v1" "api" {
  metadata {
    namespace = kubernetes_namespace.shop.metadata[0].name
  }
  spec {
    selector = kubernetes_deployment_v1.api.spec[0].template[0].metadata[0].labels
  }
}

resource "kubernetes_ingress_v1" "web" {
  spec {
    default_backend {
      service {
        name = kubernetes_service_v1.api.metadata[0].name
      }
    }
  }
}
`;

/**
 * A part bound to an address of a root module.
 * @param id Its id.
 * @param path The root module.
 * @param symbol Its address.
 * @returns The node.
 */
function part(id: string, path: string, symbol: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(0) * 10,
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * A relationship, anchored when an anchor is given.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor, if any.
 * @returns The relationship.
 */
function edge(id: string, ends: [string, string], kind: string, anchor?: [string, string]) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } }),
	};
}

/**
 * Write a board with one current variant.
 * @param name Its name.
 * @param nodes Its parts.
 * @param edges Its relationships.
 */
function current(name: string, nodes: unknown[], edges: unknown[]): void {
	board(vault, name, [
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes, edges } },
	]);
}

beforeAll(async () => {
	write(shop, {
		"aws/main.tf": AWS,
		"aws/iam.tf": 'resource "aws_iam_role" "worker" {}\n',
		"aws/modules/worker/main.tf": AWS_WORKER,
		"aws-remote/main.tf": AWS_REMOTE,
		"google/main.tf": GOOGLE,
		"azure/main.tf": AZURE,
		"kubernetes/main.tf": KUBERNETES,
	});
	write(scratch, { gitconfig: "" });
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the configurations");
	register(scratch, { [SHOP]: shop });
	const aws = [
		part("Q", "aws", "aws_sqs_queue.jobs"),
		part("F", "aws", "aws_lambda_function.worker"),
		part("R", "aws", "aws_iam_role.worker"),
		part("L", "aws", "aws_cloudwatch_log_group.worker"),
		part("M", "aws", "aws_lambda_event_source_mapping.jobs"),
		part("B", "aws", "aws_lb.web"),
		part("T", "aws", "aws_lb_target_group.web"),
	];
	current("AWS", aws, []);
	current("AWS anchored", aws, [
		// The joining declaration is the anchor: in neither end's code by design.
		edge("e1", ["Q", "F"], "queue", ["aws/main.tf", "aws_lambda_event_source_mapping.jobs"]),
		// A declaration of neither end that joins nothing.
		edge("e2", ["B", "T"], "http", ["aws/iam.tf", "aws_iam_role.worker"]),
		// The function's use of its role only sets it up, which a dependency does not accept.
		edge("e3", ["F", "R"], "dependency", ["aws/main.tf", "aws_iam_role.worker"]),
		// A joining declaration proves its join's kind: a grant is no call.
		edge("e4", ["Q", "F"], "call", ["aws/main.tf", "aws_lambda_permission.jobs"]),
	]);
	current(
		"AWS module",
		[part("W", "aws", "module.worker"), part("Q", "aws", "aws_sqs_queue.jobs")],
		// The module's variable, which the call's argument also declares, is in the code of the part bound to the call.
		[edge("e1", ["W", "Q"], "queue", ["aws/modules/worker/main.tf", "var.queue_url"])],
	);
	current(
		"AWS remote module",
		[
			part("W", "aws-remote", "module.worker"),
			part("V", "aws-remote", "aws_vpc.main"),
			part("Q", "aws-remote", "aws_sqs_queue.jobs"),
		],
		[],
	);
	current(
		"Google Cloud",
		[
			part("P", "google", "google_pubsub_topic.orders"),
			part("W", "google", "google_cloudfunctions2_function.worker"),
			part("A", "google", "google_service_account.worker"),
			part("S", "google", "google_cloud_run_v2_service.api"),
		],
		[edge("e1", ["P", "W"], "event")],
	);
	current(
		"Azure",
		[
			part("A", "azure", "azurerm_storage_account.uploads"),
			part("Q", "azure", "azurerm_storage_queue.uploads"),
			part("F", "azure", "azurerm_linux_function_app.thumbnails"),
		],
		[edge("e1", ["F", "Q"], "queue")],
	);
	current(
		"Kubernetes",
		[
			part("N", "kubernetes", "kubernetes_namespace.shop"),
			part("D", "kubernetes", "kubernetes_deployment_v1.api"),
			part("S", "kubernetes", "kubernetes_service_v1.api"),
			part("I", "kubernetes", "kubernetes_ingress_v1.web"),
		],
		[edge("e1", ["I", "S"], "http")],
	);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
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
 * The pieces of a finding's evidence, each as its kind, ends, place and symbol.
 * @param finding The finding.
 * @returns The pieces.
 */
function pieces(finding: CodeFinding): string[] {
	return (finding.evidence ?? []).map((piece) => {
		const ends = piece.from === undefined ? "" : ` ${piece.from}->${piece.to}`;
		return `${piece.kind}${ends} ${piece.path}:${piece.line} ${piece.symbol}`;
	});
}

/**
 * The findings on one board, each as its code, subject, severity and the
 * pieces of its evidence.
 * @param name The board.
 * @returns The findings, sorted.
 */
function found(name: string): string[] {
	return outcome.findings
		.filter((each) => each.board === name)
		.map((each) => [each.code, each.subject?.id, each.severity, ...pieces(each)].join(" | "))
		.toSorted();
}

test("AWS: an event source mapping is a call from its queue to its function, a listener a configured path from its load balancer to its target group, and the role, the log group and the grant are never undrawn", () => {
	expect(found("AWS")).toEqual(
		[
			"RELATIONSHIP_UNDRAWN | F | warning | call Q->F aws/main.tf:12 aws_lambda_event_source_mapping.jobs",
			"RELATIONSHIP_UNDRAWN | T | warning | configured-path B->T aws/main.tf:26 aws_lb_listener.web",
		].toSorted(),
	);
});

test("an anchor may name a joining declaration of its relationship's kind, any other Terraform declaration outside both ends does not support its relationship, and a provisioning use or a grant does not prove a dependency or a call", () => {
	const findings = found("AWS anchored");
	expect(findings.map((each) => each.split(" | ").slice(0, 3).join(" "))).toEqual([
		"ANCHOR_MISMATCH e2 warning",
		"ANCHOR_MISMATCH e3 warning",
		"ANCHOR_MISMATCH e4 warning",
	]);
	expect(findings.find((each) => each.includes(" e3 "))).toContain(
		"provisioning aws/main.tf:6 aws_iam_role.worker",
	);
	expect(findings.find((each) => each.includes(" e4 "))).toContain(
		"permission aws/main.tf:17 aws_lambda_permission.jobs",
	);
});

test("a call of a module the check does not read is set up with what its arguments name, unless an argument is an environment value", () => {
	expect(found("AWS remote module")).toEqual([
		"RELATIONSHIP_UNDRAWN | Q | warning | configured-path W->Q aws-remote/main.tf:9 aws_sqs_queue.jobs",
	]);
});

test("an anchor may name a declaration inside the module instance that an end's module call binds", () => {
	expect(found("AWS module")).toEqual([]);
});

test("Google Cloud: a function's event trigger runs from its topic to the function, and a push subscription from its topic to the endpoint", () => {
	expect(found("Google Cloud")).toEqual([
		"RELATIONSHIP_UNDRAWN | S | warning | call P->S google/main.tf:16 google_pubsub_subscription.push",
	]);
});

test("Azure: an Event Grid subscription is a call from its source to its queue, app settings are a configured path, and the role assignment and the queue's account are never undrawn", () => {
	expect(found("Azure")).toEqual([
		"RELATIONSHIP_UNDRAWN | Q | warning | call A->Q azure/main.tf:13 azurerm_eventgrid_event_subscription.uploads",
	]);
});

test("Kubernetes: an ingress is a call to its Service, a selector a configured path to the workload, and a namespace is never undrawn", () => {
	expect(found("Kubernetes")).toEqual([
		"RELATIONSHIP_UNDRAWN | D | warning | configured-path S->D kubernetes/main.tf:14 kubernetes_deployment_v1.api",
	]);
});
