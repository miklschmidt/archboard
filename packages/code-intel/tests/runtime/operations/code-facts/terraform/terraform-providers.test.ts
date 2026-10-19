// What a Terraform reference proves under the rules of the providers the user
// named (ADR 0046, TASK-367.18): AWS, Google Cloud, Azure and Kubernetes. One
// fixture configuration per provider (`fixtures/terraform-providers`): a
// trigger, a subscription and an event mapping are calls, a listener, a target
// group, a network rule and an environment value are configured paths, a grant
// is a permission, and every other reference of the provider is provisioning.
// A reference that names an end of a joining declaration says which end. A
// plan JSON's references are classified the same way, by the keys of their
// expressions.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { readTerraformPlan } from "#runtime/operations/code-facts/terraform/terraform-plan.ts";
import { terraformConfiguration } from "#runtime/operations/code-facts/terraform/terraform-configuration.ts";
import { fixtureCheckout, fixtureDirectory } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureDirectory("terraform-providers");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * What each address a file names proves, one entry per address, kind and end.
 * @param relative The file.
 * @returns `address kind end` for each, sorted.
 */
async function classified(relative: string): Promise<string[]> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "terraform") throw new Error(`${relative} was not read as Terraform`);
	const written = read.references.filter((each) => each.via === "code");
	const entries = written.map((each) => `${each.symbol} ${each.kind} ${each.joins ?? "-"}`);
	return [...new Set(entries)].toSorted();
}

test("AWS: an event source mapping names the end it runs from and the one it runs to, a listener joins its load balancer and target group, grants are permissions, and the rest is provisioning", async () => {
	expect(await classified("aws.tf")).toEqual(
		[
			// A redrive policy and an environment value point one part at another.
			"aws_sqs_queue.dead configured-path -",
			// A policy document's statement and a policy attachment are grants.
			"aws_sqs_queue.jobs permission -",
			"aws_iam_role.worker permission from",
			"aws_iam_policy.read permission to",
			// The role a function runs as, and a log group it depends on, set it up.
			"data.aws_iam_policy_document.read provisioning -",
			"aws_iam_role.worker provisioning -",
			"aws_cloudwatch_log_group.worker provisioning -",
			// The mapping runs from the queue to the function.
			"aws_sqs_queue.jobs call from",
			"aws_lambda_function.worker call to",
			// A listener runs from its load balancer to its target group.
			"aws_lb.web configured-path from",
			"aws_lb_target_group.web configured-path to",
			// A dynamic block's rule lets the other group in; its for_each only shapes the blocks.
			"aws_security_group.lb configured-path from",
			"var.ports provisioning -",
		].toSorted(),
	);
});

test("Google Cloud: a function's event trigger runs from its topic to the function, a push subscription and an Eventarc trigger join their source and endpoint, and an IAM member is a grant", async () => {
	expect(await classified("google.tf")).toEqual(
		[
			// The account a function runs as, and the one a push subscription authenticates as.
			"google_service_account.worker provisioning -",
			"google_pubsub_topic.orders configured-path -",
			// The trigger names only where it runs from: it runs to the function itself.
			"google_pubsub_topic.orders call from",
			// An Eventarc trigger on a bucket's events runs from the bucket its criteria match.
			"google_storage_bucket.uploads call from",
			"google_cloud_run_v2_service.api call to",
			// The trigger's location sets it up.
			"google_cloud_run_v2_service.api provisioning -",
			"google_pubsub_topic.orders permission to",
			"google_service_account.worker permission from",
		].toSorted(),
	);
});

test("Azure: an Event Grid subscription runs from its source to its queue, app settings are configured paths, and a role assignment is a grant", async () => {
	expect(await classified("azure.tf")).toEqual(
		[
			"azurerm_resource_group.shop provisioning -",
			"azurerm_storage_account.uploads call from",
			"azurerm_storage_queue.uploads call to",
			// azurerm 5 names a Service Bus endpoint `service_bus_queue_id`.
			"azurerm_servicebus_queue.jobs call to",
			// The account that holds the queue sets the endpoint up.
			"azurerm_storage_account.uploads provisioning -",
			"azurerm_service_plan.shop provisioning -",
			"azurerm_storage_queue.uploads configured-path -",
			"azurerm_storage_account.uploads permission to",
			"azurerm_linux_function_app.thumbnails permission from",
		].toSorted(),
	);
});

test("Kubernetes: a route to a Service is a call, a selector, an environment value and a release's values are configured paths, a network policy is a permission, and a provider with no rules keeps configured paths", async () => {
	expect(await classified("kubernetes.tf")).toEqual(
		[
			"kubernetes_namespace.shop provisioning -",
			"kubernetes_service_v1.db configured-path -",
			"kubernetes_deployment_v1.api configured-path -",
			"kubernetes_service_v1.api call -",
			"kubernetes_deployment_v1.api permission -",
			"kubernetes_service_v1.api configured-path -",
			"kubernetes_namespace.shop configured-path -",
		].toSorted(),
	);
});

test("a plan's references are classified by the keys of their expressions, as the configuration writes its arguments", () => {
	const plan = readTerraformPlan(
		JSON.stringify({
			configuration: {
				root_module: {
					resources: [
						{
							mode: "managed",
							type: "aws_lambda_function",
							name: "worker",
							expressions: {
								role: { references: ["aws_iam_role.worker.arn", "aws_iam_role.worker"] },
								environment: [{ variables: { references: ["aws_sqs_queue.dead.url"] } }],
							},
							depends_on: ["aws_cloudwatch_log_group.worker"],
						},
						{
							mode: "managed",
							type: "aws_lambda_event_source_mapping",
							name: "jobs",
							expressions: {
								event_source_arn: { references: ["aws_sqs_queue.jobs.arn"] },
								function_name: { references: ["aws_lambda_function.worker.arn"] },
							},
						},
					],
				},
			},
		}),
	);
	expect(
		plan.links.map((link) => `${link.from} ${link.reference} ${link.kind} ${link.joins ?? "-"}`),
	).toEqual([
		"aws_lambda_function.worker aws_iam_role.worker.arn provisioning -",
		"aws_lambda_function.worker aws_iam_role.worker provisioning -",
		"aws_lambda_function.worker aws_sqs_queue.dead.url configured-path -",
		"aws_lambda_function.worker aws_cloudwatch_log_group.worker provisioning -",
		"aws_lambda_event_source_mapping.jobs aws_sqs_queue.jobs.arn call from",
		"aws_lambda_event_source_mapping.jobs aws_lambda_function.worker.arn call to",
	]);
});

test("a plan that fills in a module the check does not read classifies an argument of its call by the resource the argument flows into", async () => {
	const written = fixtureCheckout({
		"main.tf": [
			'resource "aws_sqs_queue" "dead" {}',
			'module "worker" {',
			'  source          = "terraform-aws-modules/lambda/aws"',
			"  dead_letter_arn = aws_sqs_queue.dead.arn",
			"}",
		].join("\n"),
	});
	const configuration = await terraformConfiguration(
		facts.pass(new AbortController().signal, [
			{
				checkoutRoot: written.root,
				path: "plan.json",
				module: "",
				configuration: readTerraformPlan(
					JSON.stringify({
						configuration: {
							root_module: {
								module_calls: {
									worker: {
										module: {
											resources: [
												{
													mode: "managed",
													type: "aws_lambda_function",
													name: "this",
													expressions: {
														dead_letter_config: [
															{ target_arn: { references: ["var.dead_letter_arn"] } },
														],
													},
												},
											],
										},
									},
								},
							},
						},
					}),
				),
			},
		]),
		written,
		"",
	);
	const reached = (address: string) =>
		configuration.reached(address).map(({ to, link }) => `${to.address} ${link.kind}`);
	// Without the plan, the call is set up with the queue (terraform-providers.test.ts in code-check).
	expect(reached("module.worker")).toEqual([]);
	expect(reached("module.worker.aws_lambda_function.this")).toEqual([
		"aws_sqs_queue.dead configured-path",
	]);
	written.remove();
});
