// Terraform joining anchors and Azure joining rules (ADR 0046, issue #165):
// listed joins check their endpoint roles per declaration instance and pure
// links never fall back to themselves when an external end is opaque, while
// unlisted declarations support an anchor when one instance reaches both ends
// without emitting undrawn evidence.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";
import type { CodeFinding } from "#shared/protocol/code-check.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-terraform-joining-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;

const AZURE_JOINS = `variable "archive_storage_id" {}

resource "azurerm_subnet" "workers" {}
resource "azurerm_subnet" "other" {}
resource "azurerm_nat_gateway" "egress" {}
resource "azurerm_public_ip" "egress" {}
resource "azurerm_virtual_network" "core" {}
resource "azurerm_private_dns_zone" "internal" {}
resource "azurerm_application_gateway" "ingress" {}
resource "azurerm_log_analytics_workspace" "access" {}
resource "azurerm_storage_account" "archive" {}
resource "azurerm_eventhub_namespace_authorization_rule" "send" {}
resource "azurerm_network_security_group" "workers" {}
resource "azurerm_network_interface" "vm" {}

resource "azurerm_subnet_nat_gateway_association" "workers" {
  subnet_id      = azurerm_subnet.workers.id
  nat_gateway_id = azurerm_nat_gateway.egress.id
}

resource "azurerm_subnet_nat_gateway_association" "other" {
  subnet_id      = azurerm_subnet.other.id
  nat_gateway_id = azurerm_nat_gateway.egress.id
}

resource "azurerm_nat_gateway_public_ip_association" "egress" {
  nat_gateway_id       = azurerm_nat_gateway.egress.id
  public_ip_address_id = azurerm_public_ip.egress.id
}

resource "azurerm_private_dns_zone_virtual_network_link" "core" {
  virtual_network_id    = azurerm_virtual_network.core.id
  private_dns_zone_name = azurerm_private_dns_zone.internal.name
}

resource "azurerm_monitor_diagnostic_setting" "access" {
  name                       = "access"
  target_resource_id         = azurerm_application_gateway.ingress.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.access.id
  storage_account_id         = var.archive_storage_id
}

resource "azurerm_monitor_diagnostic_setting" "literal_hub" {
  name                           = "hub"
  target_resource_id             = azurerm_application_gateway.ingress.id
  eventhub_name                  = "audit-events"
  eventhub_authorization_rule_id = azurerm_eventhub_namespace_authorization_rule.send.id
}

resource "azurerm_subnet_network_security_group_association" "workers" {
  subnet_id                 = azurerm_subnet.workers.id
  network_security_group_id = azurerm_network_security_group.workers.id
}

resource "azurerm_subnet_network_security_group_association" "other" {
  subnet_id                 = azurerm_subnet.other.id
  network_security_group_id = azurerm_network_security_group.workers.id
}

resource "azurerm_network_interface_security_group_association" "vm" {
  network_interface_id      = azurerm_network_interface.vm.id
  network_security_group_id = azurerm_network_security_group.workers.id
}

resource "azurerm_eventgrid_system_topic" "events" {
  source_arm_resource_id = azurerm_application_gateway.ingress.id
}
`;

const AZURE_NET_MODULE = `resource "azurerm_subnet" "workers" {}
resource "azurerm_nat_gateway" "egress" {}

resource "azurerm_subnet_nat_gateway_association" "workers" {
  subnet_id      = azurerm_subnet.workers.id
  nat_gateway_id = azurerm_nat_gateway.egress.id
}

resource "azurerm_network_security_group" "workers" {}

resource "azurerm_subnet_network_security_group_association" "filter" {
  subnet_id                 = azurerm_subnet.workers.id
  network_security_group_id = azurerm_network_security_group.workers.id
}
`;

const AZURE_INSTANCES = `module "net_a" {
  source = "./modules/net"
}

module "net_b" {
  source = "./modules/net"
}
`;

const AZURE_SECURITY_RULE = `resource "azurerm_application_security_group" "worker" {}
resource "azurerm_application_security_group" "database" {}
resource "azurerm_application_security_group" "other_source" {}
resource "azurerm_application_security_group" "other_destination" {}

resource "azurerm_network_security_rule" "allowed" {
  source_application_security_group_ids      = [azurerm_application_security_group.other_source.id, "opaque-source"]
  destination_application_security_group_ids = [azurerm_application_security_group.other_destination.id, "opaque-destination"]
}
`;

/**
 * A part bound to an address of a root module.
 * @param id Its id.
 * @param path The root module or file path.
 * @param symbol Its address.
 * @returns The node.
 */
function part(id: string, path: string, symbol: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(0) * 10 + (id.charCodeAt(1) || 0),
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * A relationship anchored to a file and symbol.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor.
 * @returns The relationship.
 */
function edge(id: string, ends: [string, string], kind: string, anchor: [string, string]) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] },
	};
}

/**
 * Write a document with one current variant.
 * @param name Its name.
 * @param nodes Its parts.
 * @param edges Its relationships.
 */
function current(name: string, nodes: unknown[], edges: unknown[]): void {
	document(vault, name, [
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes, edges } },
	]);
}

beforeAll(async () => {
	write(shop, {
		"azure-joins/main.tf": AZURE_JOINS,
		"azure-instances/main.tf": AZURE_INSTANCES,
		"azure-instances/modules/net/main.tf": AZURE_NET_MODULE,
		"azure-other-root/main.tf": `module "net" {
  source = "../azure-instances/modules/net"
}
`,
		"azure-security/main.tf": AZURE_SECURITY_RULE,
		"azure-opaque/ingress.tf":
			'resource "azurerm_application_gateway" "ingress" {}\nresource "azurerm_log_analytics_workspace" "access" {}\n',
		"azure-opaque/diagnostics.tf": [
			'variable "archive_storage_id" {}',
			'resource "azurerm_storage_account" "archive" {}',
			'resource "azurerm_monitor_diagnostic_setting" "access" {',
			'  name                       = "access"',
			"  target_resource_id         = azurerm_application_gateway.ingress.id",
			"  log_analytics_workspace_id = azurerm_log_analytics_workspace.access.id",
			"  storage_account_id         = var.archive_storage_id",
			"}",
			"",
		].join("\n"),
	});
	write(scratch, { gitconfig: "" });
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the configurations");
	register(scratch, { [SHOP]: shop });

	const azureJoinParts = [
		part("S", "azure-joins/main.tf", "azurerm_subnet.workers"),
		part("N", "azure-joins/main.tf", "azurerm_nat_gateway.egress"),
		part("P", "azure-joins/main.tf", "azurerm_public_ip.egress"),
		part("V", "azure-joins/main.tf", "azurerm_virtual_network.core"),
		part("Z", "azure-joins/main.tf", "azurerm_private_dns_zone.internal"),
		part("G", "azure-joins/main.tf", "azurerm_application_gateway.ingress"),
		part("W", "azure-joins/main.tf", "azurerm_log_analytics_workspace.access"),
		part("A", "azure-joins/main.tf", "azurerm_storage_account.archive"),
		part("R", "azure-joins/main.tf", "azurerm_eventhub_namespace_authorization_rule.send"),
		part("D", "azure-joins/main.tf", "azurerm_monitor_diagnostic_setting.literal_hub"),
		part("F", "azure-joins/main.tf", "azurerm_network_security_group.workers"),
		part("I", "azure-joins/main.tf", "azurerm_network_interface.vm"),
	];
	current("Azure joins undrawn", azureJoinParts, []);
	current("Azure joins anchored", azureJoinParts, [
		edge("e1", ["S", "N"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_subnet_nat_gateway_association.workers",
		]),
		edge("e2", ["N", "P"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_nat_gateway_public_ip_association.egress",
		]),
		edge("e3", ["V", "Z"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_private_dns_zone_virtual_network_link.core",
		]),
		edge("e4", ["G", "W"], "storage", [
			"azure-joins/main.tf",
			"azurerm_monitor_diagnostic_setting.access",
		]),
		// Multi-destination diagnostic setting with an opaque storage_account_id must not falsely warn.
		edge("e5", ["G", "A"], "storage", [
			"azure-joins/main.tf",
			"azurerm_monitor_diagnostic_setting.access",
		]),
		// Unlisted NSG filter attachments pass cleanly when one instance reaches both ends.
		edge("e6", ["S", "F"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_subnet_network_security_group_association.workers",
		]),
		edge("e7", ["I", "F"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_network_interface_security_group_association.vm",
		]),
		// Wrong pair: listed association for another subnet on the same NAT gateway.
		edge("e8", ["S", "N"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_subnet_nat_gateway_association.other",
		]),
		// Wrong pair: unlisted NSG association reaching only one end (NSG, not workers subnet).
		edge("e9", ["S", "F"], "dependency", [
			"azure-joins/main.tf",
			"azurerm_subnet_network_security_group_association.other",
		]),
		// Kind mismatch still fires on a listed join whose kind the relationship rejects.
		edge("e10", ["S", "N"], "sync", [
			"azure-joins/main.tf",
			"azurerm_subnet_nat_gateway_association.workers",
		]),
		// Implicit self-endpoint is closed: system topic joining G -> itself does not join G -> A.
		edge("e11", ["G", "A"], "async", [
			"azure-joins/main.tf",
			"azurerm_eventgrid_system_topic.events",
		]),
	]);
	current(
		"Azure module instances",
		[
			part("SA", "azure-instances", "module.net_a.azurerm_subnet.workers"),
			part("NA", "azure-instances", "module.net_a.azurerm_nat_gateway.egress"),
			part("SB", "azure-instances", "module.net_b.azurerm_subnet.workers"),
			part("NB", "azure-instances", "module.net_b.azurerm_nat_gateway.egress"),
		],
		[
			edge("e1", ["SA", "NA"], "dependency", [
				"azure-instances/modules/net/main.tf",
				"azurerm_subnet_nat_gateway_association.workers",
			]),
			edge("e2", ["SB", "NB"], "dependency", [
				"azure-instances/modules/net/main.tf",
				"azurerm_subnet_nat_gateway_association.workers",
			]),
			// Cross-instance pair: neither net_a nor net_b joins SA to NB.
			edge("e3", ["SA", "NB"], "dependency", [
				"azure-instances/modules/net/main.tf",
				"azurerm_subnet_nat_gateway_association.workers",
			]),
		],
	);
	current(
		"Azure separate roots",
		[
			part("S", "azure-instances", "module.net_a.azurerm_subnet.workers"),
			part("F", "azure-other-root", "module.net.azurerm_network_security_group.workers"),
		],
		[
			edge("e1", ["S", "F"], "dependency", [
				"azure-instances/modules/net/main.tf",
				"azurerm_subnet_network_security_group_association.filter",
			]),
		],
	);
	current(
		"Azure opaque security groups",
		[
			part("W", "azure-security/main.tf", "azurerm_application_security_group.worker"),
			part("D", "azure-security/main.tf", "azurerm_application_security_group.database"),
		],
		[
			edge("e1", ["W", "D"], "dependency", [
				"azure-security/main.tf",
				"azurerm_network_security_rule.allowed",
			]),
		],
	);
	current(
		"Azure opaque destination",
		[
			{
				id: "G",
				name: "G",
				kind: "module",
				order: 10,
				binding: { repo: SHOP, path: "azure-opaque/ingress.tf" },
			},
			part("A", "azure-opaque/diagnostics.tf", "azurerm_storage_account.archive"),
		],
		[
			edge("e1", ["G", "A"], "storage", [
				"azure-opaque/diagnostics.tf",
				"azurerm_monitor_diagnostic_setting.access",
			]),
		],
	);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
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
 * The findings on one document, each as its code, subject, severity and the
 * pieces of its evidence.
 * @param name The document.
 * @returns The findings, sorted.
 */
function found(name: string): string[] {
	return outcome.findings
		.filter((each) => each.model === name)
		.map((each) => [each.code, each.subject?.id, each.severity, ...pieces(each)].join(" | "))
		.toSorted();
}

test("Azure directed associations and diagnostic settings are configured paths, pure links never fall back to themselves, and NSG attachments stay silent when undrawn", () => {
	expect(found("Azure joins undrawn")).toEqual(
		[
			"RELATIONSHIP_UNDRAWN | N | warning | configured-path S->N azure-joins/main.tf:16 azurerm_subnet_nat_gateway_association.workers",
			"RELATIONSHIP_UNDRAWN | P | warning | configured-path N->P azure-joins/main.tf:26 azurerm_nat_gateway_public_ip_association.egress",
			"RELATIONSHIP_UNDRAWN | W | warning | configured-path G->W azure-joins/main.tf:36 azurerm_monitor_diagnostic_setting.access",
			"RELATIONSHIP_UNDRAWN | Z | warning | configured-path V->Z azure-joins/main.tf:31 azurerm_private_dns_zone_virtual_network_link.core",
		].toSorted(),
	);
});

test("anchored listed joins and unlisted NSG attachments pass when an instance connects both ends, and wrong-pair or wrong-kind anchors warn", () => {
	const findings = found("Azure joins anchored");
	expect(findings.map((each) => each.split(" | ").slice(0, 3).join(" "))).toEqual([
		"ANCHOR_MISMATCH e10 warning",
		"ANCHOR_MISMATCH e11 warning",
		"ANCHOR_MISMATCH e8 warning",
		"ANCHOR_MISMATCH e9 warning",
	]);
	expect(findings.find((each) => each.includes(" e10 "))).toContain(
		"configured-path azure-joins/main.tf:16 azurerm_subnet_nat_gateway_association.workers",
	);
	expect(findings.find((each) => each.includes(" e8 "))).toBe("ANCHOR_MISMATCH | e8 | warning");
});

test("Terraform joining anchors compare instance-qualified addresses across calls of the same module", () => {
	expect(
		found("Azure module instances").map((each) => each.split(" | ").slice(0, 3).join(" ")),
	).toEqual(["ANCHOR_MISMATCH e3 warning"]);
});

test("an unlisted join cannot combine addresses in separate roots that call the same module", () => {
	expect(found("Azure separate roots")).toEqual(["ANCHOR_MISMATCH | e1 | warning"]);
});

test("open join sides leave room for opaque targets in either orientation", () => {
	expect(found("Azure opaque security groups")).toEqual([]);
	expect(found("Azure opaque destination")).toEqual([]);
});
