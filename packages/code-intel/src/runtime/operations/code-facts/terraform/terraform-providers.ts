// What a Terraform or OpenTofu reference proves, by the provider of the
// declaration that writes it (ADR 0046, TASK-367.18). The user named the
// providers to cover first: AWS, Google Cloud, Azure, and Kubernetes (its
// `kubernetes` and `helm` providers).
//
// A reference sits in one argument of a declaration, spelled as a path of
// attribute and nested block names: `environment.variables`,
// `default_action.target_group_arn`. Each provider's table says, for a
// resource or data source type, which arguments name what the declaration
// uses: a trigger, a subscription and an event mapping are calls; a listener,
// a target group and a network rule are configured paths; a grant is a
// permission. An environment value a resource sets for the code it runs
// points that code at another part, so it is a configured path in every
// named provider, in the shapes they share: the ones TASK-367.23 joins with
// the code that reads them (terraform-environment.ts). Every other reference
// of a named provider is provisioning: a role, a log group or a subnet that a
// function is set up with. A provider with no table keeps every reference a
// configured path, because nothing says otherwise.
//
// A joining declaration, such as an event source mapping, joins two others:
// its rule names the arguments that name the end the join runs from (the part
// that sends) and the end it runs to (the part whose work it starts): the
// arguments that name the end, never a block around them that also names a
// credential, such as the account a push subscription authenticates as. Its
// evidence runs between those ends, never from the joining declaration to
// each of them (terraform-evidence.ts). An end that its arguments name no
// declaration for is the joining declaration itself: a Cloud Function's event
// trigger starts the function's own work, and a pull subscription is where
// its topic delivers.
//
// Terraform's meta-arguments (`depends_on`, `count`, `for_each`, `lifecycle`,
// `provider` and the `provisioner` and `connection` blocks) and the
// `for_each` of a `dynamic` block order or shape what is created, so a
// reference in one is provisioning in every block.

import type { Reference } from "#runtime/operations/code-facts/facts.ts";
import { isEnvironmentArgument } from "#runtime/operations/code-facts/terraform/terraform-environment.ts";
import type { EvidenceKindSchema } from "@archboard/board/policy";
import type { z } from "zod";

type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** The evidence kinds a Terraform reference can prove. */
type TerraformKind = Extract<
	EvidenceKind,
	"call" | "configured-path" | "permission" | "provisioning"
>;

/** Which end of a joining declaration a reference names. */
type JoinEnd = NonNullable<Reference["joins"]>;

/** A declaration that joins two others, and the kind of evidence the join is. */
interface Join {
	readonly kind: TerraformKind;
	/** The arguments that name the end the join runs from. */
	readonly from: readonly string[];
	/** The arguments that name the end the join runs to. */
	readonly to: readonly string[];
}

/** The rule of one resource or data source type. */
interface ResourceRule {
	/** The kind of a reference in an argument, by its path; a path holds the arguments below it. */
	readonly arguments?: Readonly<Record<string, TerraformKind>>;
	readonly join?: Join;
}

/** One provider: the type prefixes of its declarations, and the rules of its types. */
interface ProviderRules {
	readonly prefixes: readonly string[];
	readonly types: Readonly<Record<string, ResourceRule>>;
}

/** What a reference proves, and the end of a joining declaration it names, if any. */
interface Classified {
	readonly kind: TerraformKind;
	readonly joins?: JoinEnd;
}

/**
 * A joining declaration's rule.
 * @param kind What the join proves.
 * @param from The arguments that name the end it runs from.
 * @param to The arguments that name the end it runs to.
 * @param rest The kinds of its other arguments.
 * @returns The rule.
 */
function join(
	kind: TerraformKind,
	from: readonly string[],
	to: readonly string[],
	rest?: Readonly<Record<string, TerraformKind>>,
): ResourceRule {
	return { join: { kind, from, to }, ...(rest === undefined ? {} : { arguments: rest }) };
}

/**
 * One rule for several types, such as a resource and its older alias.
 * @param types The types.
 * @param rule The rule.
 * @returns Each type with the rule.
 */
function shared(types: readonly string[], rule: ResourceRule): Record<string, ResourceRule> {
	return Object.fromEntries(types.map((type) => [type, rule]));
}

/**
 * The grant of a Google Cloud IAM member or binding: from the member to what
 * the grant is on.
 * @param resource The resource type the grant is on, without `google_`.
 * @param scope The argument that names what the grant is on.
 * @returns The rules of the member and the binding.
 */
function googleGrant(resource: string, scope: string): Record<string, ResourceRule> {
	const rule = join("permission", ["member", "members"], [scope]);
	return shared([`google_${resource}_iam_member`, `google_${resource}_iam_binding`], rule);
}

const AWS: ProviderRules = {
	prefixes: ["aws_"],
	types: {
		aws_lambda_event_source_mapping: join("call", ["event_source_arn"], ["function_name"]),
		aws_pipes_pipe: join("call", ["source"], ["target"]),
		aws_sns_topic_subscription: join("call", ["topic_arn"], ["endpoint"]),
		aws_cloudwatch_event_target: join("call", ["rule"], ["arn"]),
		aws_s3_bucket_notification: join(
			"call",
			["bucket"],
			["lambda_function.lambda_function_arn", "queue.queue_arn", "topic.topic_arn"],
		),
		aws_lambda_function_event_invoke_config: join(
			"call",
			["function_name"],
			["destination_config"],
		),
		aws_apigatewayv2_integration: join("call", ["api_id"], ["integration_uri"]),
		aws_api_gateway_integration: join("call", ["rest_api_id"], ["uri"]),
		aws_scheduler_schedule: { arguments: { "target.arn": "call" } },
		aws_sfn_state_machine: { arguments: { definition: "call" } },
		aws_lambda_function: { arguments: { dead_letter_config: "configured-path" } },
		aws_sqs_queue: { arguments: { redrive_policy: "configured-path" } },
		...shared(
			["aws_lb_listener", "aws_alb_listener"],
			join("configured-path", ["load_balancer_arn"], ["default_action"]),
		),
		...shared(
			["aws_lb_listener_rule", "aws_alb_listener_rule"],
			join("configured-path", ["listener_arn"], ["action"]),
		),
		...shared(
			["aws_lb_target_group_attachment", "aws_alb_target_group_attachment"],
			join("configured-path", ["target_group_arn"], ["target_id"]),
		),
		aws_ecs_service: join("configured-path", ["load_balancer.target_group_arn"], []),
		aws_autoscaling_group: join("configured-path", ["target_group_arns"], []),
		aws_apigatewayv2_route: { arguments: { target: "configured-path" } },
		aws_cloudfront_distribution: {
			arguments: {
				"origin.domain_name": "configured-path",
				"origin.vpc_origin_config": "configured-path",
			},
		},
		aws_route53_record: { arguments: { alias: "configured-path", records: "configured-path" } },
		aws_security_group: join("configured-path", ["ingress.security_groups"], [], {
			"egress.security_groups": "configured-path",
		}),
		aws_security_group_rule: {
			arguments: {
				source_security_group_id: "configured-path",
				security_group_id: "configured-path",
			},
		},
		aws_vpc_security_group_ingress_rule: join(
			"configured-path",
			["referenced_security_group_id"],
			["security_group_id"],
		),
		aws_vpc_security_group_egress_rule: join(
			"configured-path",
			["security_group_id"],
			["referenced_security_group_id"],
		),
		aws_lambda_permission: join("permission", ["source_arn"], ["function_name"]),
		aws_iam_role_policy_attachment: join("permission", ["role"], ["policy_arn"]),
		aws_iam_role_policy: join("permission", ["role"], ["policy"]),
		aws_iam_policy: { arguments: { policy: "permission" } },
		aws_iam_policy_document: { arguments: { statement: "permission" } },
		aws_sqs_queue_policy: join("permission", ["policy"], ["queue_url"]),
		aws_sns_topic_policy: join("permission", ["policy"], ["arn"]),
		aws_s3_bucket_policy: join("permission", ["policy"], ["bucket"]),
	},
};

const GOOGLE_CLOUD: ProviderRules = {
	prefixes: ["google_"],
	types: {
		google_pubsub_subscription: join(
			"call",
			["topic"],
			["push_config.push_endpoint", "bigquery_config.table", "cloud_storage_config.bucket"],
			{ dead_letter_policy: "configured-path" },
		),
		google_cloudfunctions2_function: join(
			"call",
			["event_trigger.pubsub_topic", "event_trigger.event_filters"],
			[],
		),
		google_cloudfunctions_function: join("call", ["event_trigger.resource"], []),
		google_eventarc_trigger: join(
			"call",
			["transport.pubsub.topic", "matching_criteria", "channel"],
			[
				"destination.cloud_run_service",
				"destination.cloud_function",
				"destination.gke",
				"destination.workflow",
				"destination.http_endpoint",
			],
		),
		google_storage_notification: join("call", ["bucket"], ["topic"]),
		google_cloud_scheduler_job: {
			arguments: { "pubsub_target.topic_name": "call", "http_target.uri": "call" },
		},
		...shared(["google_compute_backend_service", "google_compute_region_backend_service"], {
			arguments: { backend: "configured-path" },
		}),
		google_compute_url_map: {
			arguments: { default_service: "configured-path", path_matcher: "configured-path" },
		},
		...shared(["google_compute_target_http_proxy", "google_compute_target_https_proxy"], {
			arguments: { url_map: "configured-path" },
		}),
		...shared(["google_compute_global_forwarding_rule", "google_compute_forwarding_rule"], {
			arguments: { target: "configured-path", backend_service: "configured-path" },
		}),
		google_compute_region_network_endpoint_group: {
			arguments: {
				cloud_run: "configured-path",
				cloud_function: "configured-path",
				app_engine: "configured-path",
			},
		},
		google_compute_firewall: join(
			"configured-path",
			["source_service_accounts", "source_tags"],
			["target_service_accounts", "target_tags"],
		),
		...googleGrant("pubsub_topic", "topic"),
		...googleGrant("pubsub_subscription", "subscription"),
		...googleGrant("cloud_run_service", "service"),
		...googleGrant("cloud_run_v2_service", "name"),
		...googleGrant("cloudfunctions2_function", "cloud_function"),
		...googleGrant("cloudfunctions_function", "cloud_function"),
		...googleGrant("storage_bucket", "bucket"),
		...googleGrant("secret_manager_secret", "secret_id"),
		...googleGrant("bigquery_dataset", "dataset_id"),
		...googleGrant("service_account", "service_account_id"),
		...googleGrant("project", "project"),
	},
};

/**
 * Where an Event Grid subscription delivers its events: azurerm 5 names each
 * endpoint `*_id`, and azurerm 3 and 4 `*_endpoint_id`.
 */
const EVENT_GRID_ENDPOINTS = [
	"azure_function_endpoint.function_id",
	"eventhub_id",
	"eventhub_endpoint_id",
	"hybrid_connection_id",
	"hybrid_connection_endpoint_id",
	"service_bus_queue_id",
	"service_bus_queue_endpoint_id",
	"service_bus_topic_id",
	"service_bus_topic_endpoint_id",
	"storage_queue_endpoint.queue_name",
	"webhook_endpoint.url",
];

const AZURE: ProviderRules = {
	prefixes: ["azurerm_"],
	types: {
		azurerm_eventgrid_event_subscription: join("call", ["scope"], EVENT_GRID_ENDPOINTS),
		azurerm_eventgrid_system_topic_event_subscription: join(
			"call",
			["system_topic"],
			EVENT_GRID_ENDPOINTS,
		),
		azurerm_eventgrid_system_topic: join(
			"call",
			["source_arm_resource_id", "source_resource_id"],
			[],
		),
		azurerm_servicebus_subscription: join("call", ["topic_id"], ["forward_to"], {
			forward_dead_lettered_messages_to: "configured-path",
		}),
		azurerm_servicebus_queue: {
			arguments: {
				forward_to: "configured-path",
				forward_dead_lettered_messages_to: "configured-path",
			},
		},
		...shared(
			[
				"azurerm_linux_function_app",
				"azurerm_windows_function_app",
				"azurerm_function_app",
				"azurerm_linux_web_app",
				"azurerm_windows_web_app",
				"azurerm_app_service",
			],
			{ arguments: { connection_string: "configured-path" } },
		),
		azurerm_lb_rule: join("configured-path", ["loadbalancer_id"], ["backend_address_pool_ids"]),
		azurerm_network_interface_backend_address_pool_association: join(
			"configured-path",
			["backend_address_pool_id"],
			["network_interface_id"],
		),
		azurerm_application_gateway: { arguments: { backend_address_pool: "configured-path" } },
		azurerm_network_security_rule: join(
			"configured-path",
			["source_application_security_group_ids"],
			["destination_application_security_group_ids"],
		),
		azurerm_virtual_network_peering: join(
			"configured-path",
			["virtual_network_name"],
			["remote_virtual_network_id"],
		),
		azurerm_private_endpoint: { arguments: { private_service_connection: "configured-path" } },
		azurerm_role_assignment: join("permission", ["principal_id"], ["scope"]),
	},
};

const KUBERNETES: ProviderRules = {
	prefixes: ["kubernetes_", "helm_"],
	types: {
		...shared(["kubernetes_service", "kubernetes_service_v1"], {
			arguments: { "spec.selector": "configured-path" },
		}),
		...shared(["kubernetes_ingress", "kubernetes_ingress_v1"], {
			arguments: {
				"spec.rule.http.path.backend": "call",
				"spec.backend": "call",
				"spec.default_backend": "call",
			},
		}),
		...shared(["kubernetes_network_policy", "kubernetes_network_policy_v1"], {
			arguments: { spec: "permission" },
		}),
		...shared(["kubernetes_config_map", "kubernetes_config_map_v1"], {
			arguments: { data: "configured-path" },
		}),
		helm_release: {
			arguments: { set: "configured-path", set_list: "configured-path", values: "configured-path" },
		},
	},
};

/** The providers the user named, in the order they were named. */
const PROVIDERS: readonly ProviderRules[] = [AWS, GOOGLE_CLOUD, AZURE, KUBERNETES];

/** Terraform's own meta-arguments, which shape what is created in every block. */
const META_ARGUMENTS = new Set([
	"depends_on",
	"count",
	"for_each",
	"lifecycle",
	"provider",
	"provisioner",
	"connection",
]);

/**
 * Whether an argument is one of the paths, or below one of them.
 * @param paths The paths, such as `default_action`.
 * @param argument The argument's path, such as `default_action.target_group_arn`.
 * @returns The longest path that holds it, or undefined.
 */
function holding(paths: readonly string[], argument: string): string | undefined {
	return paths
		.filter((path) => argument === path || argument.startsWith(`${path}.`))
		.toSorted((left, right) => right.length - left.length)[0];
}

/**
 * Whether an argument shapes what is created rather than what it uses: a
 * meta-argument, or the `for_each` of a `dynamic` block.
 * @param argument The argument's path.
 * @returns True when it does.
 */
function isMetaArgument(argument: readonly string[]): boolean {
	return META_ARGUMENTS.has(argument[0] ?? "") || argument.at(-1) === "for_each";
}

/**
 * The rule of a type of a provider the user named.
 * @param type The resource or data source type, if the declaration has one.
 * @returns The rule, empty for a type its provider's table does not list, or
 * undefined for a type of another provider and a declaration with no type.
 */
function ruleOf(type: string | undefined): ResourceRule | undefined {
	if (type === undefined) return undefined;
	const provider = PROVIDERS.find((each) =>
		each.prefixes.some((prefix) => type.startsWith(prefix)),
	);
	return provider === undefined ? undefined : (provider.types[type] ?? {});
}

/**
 * The end of a join an argument names, if the rule joins and the argument names one.
 * @param joining The rule's join.
 * @param path The argument's path, its names joined by `.`.
 * @returns What the reference proves, or undefined.
 */
function endNamed(joining: Join | undefined, path: string): Classified | undefined {
	if (joining === undefined) return undefined;
	if (holding(joining.from, path) !== undefined) return { kind: joining.kind, joins: "from" };
	return holding(joining.to, path) === undefined ? undefined : { kind: joining.kind, joins: "to" };
}

/**
 * What a reference in an argument that names no end of a join proves: an
 * environment value is a configured path, an argument the rule lists has its
 * kind, and any other is provisioning.
 * @param rule The rule of the declaration's type.
 * @param argument The argument's path.
 * @returns The kind.
 */
function kindOf(rule: ResourceRule, argument: readonly string[]): TerraformKind {
	if (isEnvironmentArgument(argument)) return "configured-path";
	const kinds = rule.arguments ?? {};
	const named = holding(Object.keys(kinds), argument.join("."));
	return named === undefined ? "provisioning" : (kinds[named] ?? "provisioning");
}

/**
 * What a reference in one argument of a declaration proves.
 * @param type The declaration's resource or data source type, such as
 * `aws_lambda_function`; undefined for a module call, a variable, an output or
 * a local value.
 * @param argument The argument's path, outermost name first.
 * @returns Its evidence kind, and the end of a joining declaration it names.
 */
function classifyReference(type: string | undefined, argument: readonly string[]): Classified {
	if (isMetaArgument(argument)) return { kind: "provisioning" };
	const rule = ruleOf(type);
	if (rule === undefined) return { kind: "configured-path" };
	return endNamed(rule.join, argument.join(".")) ?? { kind: kindOf(rule, argument) };
}

/**
 * What an argument of a call of a module the check does not read proves of
 * the call, which reaches what the argument names (terraform-configuration.ts).
 * No rule knows what the module does with the value, so it is provisioning,
 * as every unlisted reference of a named provider is: most such arguments
 * place or name what the module creates, as `vpc_id` does. An environment
 * value is a configured path, as in every resource. A plan that fills the
 * module in classifies the reference by the resource it flows into instead.
 * @param argument The argument's path.
 * @returns The kind.
 */
function unreadModuleArgumentKind(argument: readonly string[]): TerraformKind {
	return isEnvironmentArgument(argument) ? "configured-path" : "provisioning";
}

/**
 * Whether a declaration joins two others by its provider's rules, as an
 * event source mapping joins a queue and a function.
 * @param address The declaration's address, as its module writes it:
 * `aws_lambda_event_source_mapping.jobs`.
 * @returns True when it does.
 */
function isJoiningDeclaration(address: string): boolean {
	const [first, second] = address.split(".");
	const type = first === "data" || first === "ephemeral" ? second : first;
	return PROVIDERS.some((provider) => provider.types[type ?? ""]?.join !== undefined);
}

export {
	type Classified,
	type JoinEnd,
	type TerraformKind,
	classifyReference,
	isJoiningDeclaration,
	isMetaArgument,
	unreadModuleArgumentKind,
};
