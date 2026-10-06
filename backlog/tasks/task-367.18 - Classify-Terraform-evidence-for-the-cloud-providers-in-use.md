---
id: TASK-367.18
title: Classify Terraform evidence for the cloud providers in use
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 16:25'
labels:
  - code-check
  - needs-info
dependencies:
  - TASK-367.17
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 626000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most references in a Terraform configuration are about provisioning, such as a role or a log group attached to a function. Only some are relationships at run time: a trigger, a subscription, a listener, a network rule. Without a rule per provider, the undrawn check reports every provisioning reference as a missing relationship. Which providers to cover first is the user's call. Inframap's per-provider lists are prior art.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The user named the providers to cover first
- [ ] #2 For each named provider, triggers, subscriptions and event mappings are calls, listeners, target groups and network rules are configured paths, grants are permissions, and the rest is provisioning
- [ ] #3 Provisioning references are not reported as missing relationships
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: none expected (the classification lives inside Code facts and Code check, which the Archboard server board draws as modules; branch Archboard server@TASK-367.18 only if a description must change).
1. Code facts: terraform-providers.ts holds one table per provider the user named (AWS aws_, Google Cloud google_, Azure azurerm_, Kubernetes kubernetes_ and helm_): per resource type, the kind of a reference by the argument it sits in, and for a joining resource the arguments that name the end the join runs from and the end it runs to, with the join's kind. A reference of a named provider that no rule names is provisioning; Terraform's meta-arguments are provisioning everywhere; a provider with no table keeps configured-path (ADR 0046).
2. terraform-adapter.ts referenceAt classifies each reference by its top-level block's type and its argument path (attributes and nested blocks, a dynamic block by its label). terraform-plan.ts classifies a plan's references the same way by their expression keys. Reference.kind gains permission and provisioning, and a reference that names an end of a join says which end (facts.ts, one hunk). terraform-configuration.ts carries kind and end on each link.
3. Code check: terraform-evidence.ts piecesIn gives each link its kind; a joining declaration gives evidence from the owners of what its from-arguments reach to the owners of what its to-arguments reach (a side with no reach is the declaration itself), cited at the joining declaration; one piece per pair and kind. support.ts drops the Terraform branch: a Terraform anchor is judged as any other, except that an anchor naming a joining declaration is not judged by where it is declared.
4. Owners: code-facts/tests (classification per provider through the adapter and a plan), code-check/tests/terraform-providers.test.ts over a fixture configuration per provider (calls, configured paths, permissions, provisioning never undrawn, joins between the ends, anchors on joining declarations); update terraform-check.test.ts where provisioning now changes its findings.
5. Try on terraform-aws-lambda (event-source-mapping, triggers), terraform-docs-samples functions/pubsub and eventarc, azurerm examples eventgrid and servicebus, terraform-provider-kubernetes _examples, through temporary vaults, before and after.
6. Docs: authoring.md (how Terraform evidence is classified), design-checks.md. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Criterion 1: on 2026-10-06 the user named the providers to cover first: AWS, Google Cloud, Azure, and the Kubernetes provider (the Terraform kubernetes and helm providers).

Built (65aae12eb code, 48e147ac1 docs): code-facts gains terraform-providers.ts (one table per provider, the classifier) and terraform-reach.ts (the reach search, moved out of terraform-configuration.ts to keep it under 600 lines); terraform-adapter.ts classifies each reference by its top-level block's type and the path of the argument it sits in (attribute and nested block names, a dynamic block by its label, its content adding no name); terraform-plan.ts classifies a plan's references by their expression keys; terraform-configuration.ts carries kind and join end on each link. code-check: terraform-evidence.ts piecesIn takes link kinds and turns a joining declaration into evidence between its ends; support.ts judges Terraform anchors again, except one naming a joining declaration. Owners: code-facts/tests/terraform-providers.test.ts over fixtures/terraform-providers/{aws,google,azure,kubernetes}.tf (criterion 2, and a plan); code-check/tests/terraform-providers.test.ts (criteria 2 and 3: joins between ends, provisioning and grants never undrawn, anchors). terraform-check.test.ts and terraform-facts.test.ts (TASK-367.17) adapted: the role is provisioning now, so the undrawn case uses an environment value; the plan case cites the plan through an 'other' relationship.

Contract changes (outside the named fence, needed because a kind set in referenceAt must reach piecesIn): Reference.kind widens to every EvidenceKind and gains joins?: from|to (facts.ts); Link and Written carry kind and joins (terraform-configuration.ts); PlanLink carries kind and joins (terraform-plan.ts); code-facts/index.ts exports isJoiningDeclaration.

Decisions the ADR left open:
1. Classification lives in code-facts (where the syntax is), keyed by (resource or data source type, argument path); a path rule holds the arguments below it, the longest wins.
2. Terraform's meta-arguments (depends_on, count, for_each, lifecycle, provider, provisioner, connection) and a dynamic block's for_each are provisioning in every block, any provider: they order or shape creation and carry no traffic.
3. An environment value a resource sets (environment { variables }, environment_variables, runtime_environment_variables, app_settings, an env block's value) is a configured path in every named provider, by shape, not per type: ADR 0046 says configuration that points one part at another proves a network relationship, compose treats env values the same, and TASK-367.23 joins the same shapes.
4. A reference in a module call, variable, output or local has no provider, so it stays configured-path; the kind of a way through passing declarations is the kind of the first reference, the one in the resource.
5. A joining declaration's evidence runs from the owners of what its from-arguments reach to the owners of what its to-arguments reach, of the join's kind, cited at the joining declaration (its file, first line and address as its file writes it, so an agent can copy it into an anchor); never from the joining declaration to each end. An end its arguments reach nothing for is the declaration itself (one rule for a Cloud Function's event trigger, an ECS service's target groups, a pull subscription).
6. The reach search keeps one way per (target, kind, end): a resource that names another in two arguments (an eventarc trigger's location and its destination) must keep both. Pieces stay one per pair and kind.
7. support.ts: an anchor naming a joining declaration (by its type in the tables) is not judged by location (ADR 0046: in neither end's code by design); every other Terraform anchor is judged as code, and a part bound to an address is held to its root module's address space (heldInFiles with the root). Whether the join joins exactly these ends is not checked: the ADR allows the joining declaration as anchor, and the evidence judgement already sees it.
8. Kubernetes provider follows ADR 0046's Kubernetes section (the same objects as TASK-367.19): an Ingress backend is a call, a Service selector a configured path, a NetworkPolicy a permission; config map data and a helm_release's set and values are configured paths.
9. Direction: a join runs from the sender to the part whose work it starts (ADR 0046); an IAM grant from the member to what the grant is on; a firewall from source to target (ingress, GCP's default).

Provider tables (src/runtime/code-facts/lib/terraform-providers.ts):
- AWS calls: joins aws_lambda_event_source_mapping (event_source_arn -> function_name), aws_pipes_pipe, aws_sns_topic_subscription (topic_arn -> endpoint), aws_cloudwatch_event_target (rule -> arn), aws_s3_bucket_notification, aws_lambda_function_event_invoke_config, aws_apigatewayv2_integration, aws_api_gateway_integration; aws_scheduler_schedule target.arn, aws_sfn_state_machine definition. Configured paths: joins aws_lb_listener / aws_alb_listener (load_balancer_arn -> default_action), listener rule, target group attachment, aws_vpc_security_group_ingress_rule and egress_rule, aws_ecs_service and aws_autoscaling_group (target groups -> self), aws_security_group (ingress groups -> self, egress groups); aws_sqs_queue redrive_policy, aws_lambda_function dead_letter_config, aws_apigatewayv2_route target, aws_cloudfront_distribution origin, aws_route53_record alias and records, aws_security_group_rule. Permissions: joins aws_lambda_permission (source_arn -> function_name), aws_iam_role_policy_attachment, aws_iam_role_policy, aws_sqs_queue_policy, aws_sns_topic_policy, aws_s3_bucket_policy; aws_iam_policy policy, aws_iam_policy_document statement.
- Google Cloud calls: joins google_pubsub_subscription (topic -> push_config, bigquery_config, cloud_storage_config), google_cloudfunctions2_function and google_cloudfunctions_function (event trigger -> self), google_eventarc_trigger (transport.pubsub.topic -> destination), google_storage_notification; google_cloud_scheduler_job pubsub_target.topic_name and http_target.uri. Configured paths: join google_compute_firewall (source -> target service accounts and tags); a subscription's dead_letter_policy, backend services, URL maps, target proxies, forwarding rules, serverless NEGs. Permissions: IAM members and bindings of pubsub topics and subscriptions, Cloud Run v1/v2, Cloud Functions v1/v2, buckets, secrets, BigQuery datasets, service accounts, projects (member -> scope).
- Azure calls: joins azurerm_eventgrid_event_subscription (scope -> endpoints), system topic event subscription, eventgrid system topic (source -> self), azurerm_servicebus_subscription (topic_id -> forward_to). Configured paths: joins azurerm_lb_rule, NIC backend pool association, azurerm_network_security_rule (application security groups), azurerm_virtual_network_peering; Service Bus queue forwarding, app connection_string, application gateway backend pools, private endpoint connections. Permissions: join azurerm_role_assignment (principal_id -> scope).
- Kubernetes: ingress backends call; service selector, config map data, helm_release set and values configured paths; network policy spec permission.
Falls back on purpose: every unlisted type of a named provider is provisioning; ECS container_definitions (one encoded string mixing env, image and log group) provisioning; aws_security_group_rule configured paths from the rule, not a join (its direction is its type literal); a Kubernetes Secret and kubernetes_manifest provisioning; a provider with no table keeps configured-path.

Real configurations (cloned into the session scratch, temporary vault, the real checkCode; 9 boards, 42 parts, 16 relationships): terraform-aws-lambda 3a1405b (event-source-mapping, triggers), terraform-aws-vpc b3abd6d (complete), terraform-docs-samples f96259b (functions/pubsub, eventarc/basic_pubsub), terraform-provider-azurerm examples (eventgrid/event-subscription, servicebus/forwarding), terraform-provider-kubernetes _examples (ingress, wordpress-mysql-gce-pv). Before (HEAD 8ca30b732): 23 findings, 14 RELATIONSHIP_UNDRAWN warnings, every one a provisioning reference (Lambda role and log group, GCP service accounts and bucket, Azure resource group, storage account and Service Bus namespace, Kubernetes namespace and Secret, VPC, internet gateway and NAT gateway); RELATIONSHIP_BACKWARDS topic -> function (the trigger is written in the function); RELATIONSHIP_UNSUPPORTED rule -> Lambda, Event Grid group -> queue, Service Bus source -> destination, Pub/Sub topic -> Cloud Run (Eventarc). After: 8 findings, all information, no warning: the five event relationships hold through their joining declarations (an undrawn twin board shows each piece: call rule->fn at aws_cloudwatch_event_target.scan_ami_lambda_function, call topic->fn at google_cloudfunctions2_function.default, call topic->run at google_eventarc_trigger.default, call rg->q at azurerm_eventgrid_event_subscription.example, call src->dst at azurerm_servicebus_subscription.example, call ing->svc and configured-path selector svc->rc on Kubernetes). Four 'dependency' relationships on the VPC board (endpoints -> VPC, internet gateway -> VPC, NAT gateway -> addresses and -> subnets) now have only provisioning evidence and say so (a placement is provisioning). Three event source mappings of terraform-aws-lambda stay unsupported: the module takes sources through for_each = var.event_source_mapping and each.value, which name no address; authoring.md says to anchor at the module call's argument. Cold check 0.58 s before, 0.6 s after.

Board: no proposal. Code facts says references carry their evidence kind and Code check that references join resource-bound parts; both stay true, and the classification lives inside those two modules.

Gate (lanes one at a time, shared working tree with other agents' uncommitted work, after 65aae12eb and 48e147ac1): lint exit 1 only in others' files (lint:tests 0; lint:policy: checkouts.ts, evidence.ts, part-code.ts, c-definitions.ts, csharp-adapter.ts, csharp-resolution.ts, include-scope.ts, lookup.ts, swift-resolution.ts); fmt:check exit 1 only on others' files (checkouts.ts, c-definitions.ts, csharp-*.ts, definition-site.ts, swift-*.ts); type-check exit 1 only in csharp-adapter.ts (another task's ParseFacts change); build:frontend 0; test:modules 4219 pass 3 fail (c-facts.test.ts x2 over another task's uncommitted c-definitions.ts; wide-boards.test.ts Archboard server first layout 5.0 s over its 3 s bound at load average 13, failing again alone); test:system 194/1 (staleness-source: the checkout changed under it while other agents edited; passes alone); test:repository 0; test:serial-browser 0. HEAD 8ca30b732 plus the code commit alone, exported to a scratch directory: tsc 0, the code-facts and code-check owners pass. Touched files: lint and fmt clean.
<!-- SECTION:NOTES:END -->
