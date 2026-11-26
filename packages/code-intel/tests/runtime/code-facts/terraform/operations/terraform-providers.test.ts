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
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { readTerraformPlan } from "#runtime/code-facts/terraform/operations/terraform-plan.ts";
import { terraformConfiguration } from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
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

test("Azure joining declarations classify directed paths, keep credentials provisioning, and leave undirected NSG attachments unlisted", async () => {
	const written = fixtureCheckout({
		"main.tf": [
			'resource "azurerm_subnet" "workers" {}',
			'resource "azurerm_nat_gateway" "egress" {}',
			'resource "azurerm_public_ip" "egress" {}',
			'resource "azurerm_virtual_network" "core" {}',
			'resource "azurerm_private_dns_zone" "internal" {}',
			'resource "azurerm_application_gateway" "ingress" {}',
			'resource "azurerm_log_analytics_workspace" "access" {}',
			'resource "azurerm_eventhub_namespace_authorization_rule" "send" {}',
			'resource "azurerm_network_security_group" "workers" {}',
			'resource "azurerm_subnet_nat_gateway_association" "workers" {',
			"  subnet_id      = azurerm_subnet.workers.id",
			"  nat_gateway_id = azurerm_nat_gateway.egress.id",
			"}",
			'resource "azurerm_nat_gateway_public_ip_association" "egress" {',
			"  nat_gateway_id       = azurerm_nat_gateway.egress.id",
			"  public_ip_address_id = azurerm_public_ip.egress.id",
			"}",
			'resource "azurerm_private_dns_zone_virtual_network_link" "core" {',
			"  virtual_network_id    = azurerm_virtual_network.core.id",
			"  private_dns_zone_name = azurerm_private_dns_zone.internal.name",
			"}",
			'resource "azurerm_monitor_diagnostic_setting" "access" {',
			"  target_resource_id             = azurerm_application_gateway.ingress.id",
			"  log_analytics_workspace_id     = azurerm_log_analytics_workspace.access.id",
			"  eventhub_authorization_rule_id = azurerm_eventhub_namespace_authorization_rule.send.id",
			"}",
			'resource "azurerm_subnet_network_security_group_association" "workers" {',
			"  subnet_id                 = azurerm_subnet.workers.id",
			"  network_security_group_id = azurerm_network_security_group.workers.id",
			"}",
		].join("\n"),
	});
	try {
		const read = await facts.pass(new AbortController().signal).read(written, "main.tf");
		if (read?.adapter !== "terraform") throw new Error("main.tf was not read as Terraform");
		const entries = [
			...new Set(
				read.references
					.filter((each) => each.via === "code")
					.map((each) => `${each.symbol} ${each.kind} ${each.joins ?? "-"}`),
			),
		].toSorted();
		expect(entries).toEqual(
			[
				"azurerm_subnet.workers configured-path from",
				"azurerm_nat_gateway.egress configured-path to",
				"azurerm_nat_gateway.egress configured-path from",
				"azurerm_public_ip.egress configured-path to",
				"azurerm_virtual_network.core configured-path from",
				"azurerm_private_dns_zone.internal configured-path to",
				"azurerm_application_gateway.ingress configured-path from",
				"azurerm_log_analytics_workspace.access configured-path to",
				"azurerm_eventhub_namespace_authorization_rule.send provisioning -",
				"azurerm_subnet.workers provisioning -",
				"azurerm_network_security_group.workers provisioning -",
			].toSorted(),
		);
	} finally {
		written.remove();
	}
});
