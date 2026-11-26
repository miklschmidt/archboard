// History lens commit and footprint attribution for Terraform depth-1 named
// nested blocks (TASK-682.01): edits to one bound nested block attribute only
// to that block, leaving untouched sibling blocks unattributed, both in a root
// module and inside a local module call.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import {
	currentVariant,
	LEGACY_BOARD_SCHEMA_VERSION,
	LegacyBoardSchema,
} from "@archboard/model/legacy-board";
import { git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-history-"));
const shop = join(scratch, "shop");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/gw-history";

let lens: typeof LensModule;
let baseCommit = "";
let editDeviceCommit = "";
let editSiblingCommit = "";
let editModuleCommit = "";

/**
 * Commit all changes in `shop` and return the commit SHA.
 * @param message Commit subject.
 * @returns The commit SHA.
 */
function commit(message: string): string {
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", message);
	const rev = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: shop });
	return rev.stdout.toString().trim();
}

/**
 * Render root `infra/main.tf` with configurable listener ports.
 * @param devicePort Port for `device-https`.
 * @param hostPort Port for `example.com`.
 * @returns HCL source.
 */
function gatewayMain(devicePort: number, hostPort: number): string {
	return [
		'resource "azurerm_application_gateway" "ingress" {',
		"  http_listener {",
		'    name = "device-https"',
		`    port = ${devicePort}`,
		"  }",
		"  http_listener {",
		'    name = "example.com"',
		`    port = ${hostPort}`,
		"  }",
		"}",
		"",
		'module "gw" {',
		'  source = "./modules/gw"',
		"}",
		"",
	].join("\n");
}

/**
 * Render `infra/modules/gw/main.tf` with a configurable port.
 * @param port Port for `device-https`.
 * @returns HCL source.
 */
function moduleGateway(port: number): string {
	return [
		'resource "azurerm_application_gateway" "ingress" {',
		"  http_listener {",
		'    name = "device-https"',
		`    port = ${port}`,
		"  }",
		"  http_listener {",
		'    name = "example.com"',
		"    port = 80",
		"  }",
		"}",
		"",
	].join("\n");
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"infra/main.tf": gatewayMain(443, 80),
		"infra/modules/gw/main.tf": moduleGateway(443),
	});
	baseCommit = commit("initial gateway");

	write(shop, { "infra/main.tf": gatewayMain(8443, 80) });
	editDeviceCommit = commit("edit device-https listener");

	write(shop, { "infra/main.tf": gatewayMain(8443, 8080) });
	editSiblingCommit = commit("edit example.com sibling listener");

	write(shop, { "infra/modules/gw/main.tf": moduleGateway(9443) });
	editModuleCommit = commit("edit module gw device-https listener");

	register(scratch, { [SHOP]: shop });
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

test("History lens isolates edits to a bound nested block and leaves untouched sibling blocks unattributed", async () => {
	const board = LegacyBoardSchema.parse({
		schemaVersion: LEGACY_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "gwHist",
		name: "Gateway",
		level: "system",
		version: 1,
		createdAt: "2026-10-07T00:00:00.000Z",
		updatedAt: "2026-10-07T00:00:00.000Z",
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: {
					nodes: [
						{
							id: "device",
							name: "Device",
							kind: "module",
							order: 10,
							binding: {
								repo: SHOP,
								path: "infra",
								symbol: 'azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
							},
						},
						{
							id: "host",
							name: "Host",
							kind: "module",
							order: 20,
							binding: {
								repo: SHOP,
								path: "infra",
								symbol: 'azurerm_application_gateway.ingress.http_listener["example.com"]',
							},
						},
						{
							id: "modDev",
							name: "Module Device",
							kind: "module",
							order: 30,
							binding: {
								repo: SHOP,
								path: "infra",
								symbol:
									'module.gw[0].azurerm_application_gateway.ingress.http_listener["device-https"]',
							},
						},
						{
							id: "modHost",
							name: "Module Host",
							kind: "module",
							order: 40,
							binding: {
								repo: SHOP,
								path: "infra",
								symbol:
									'module.gw.azurerm_application_gateway.ingress.http_listener["example.com"]',
							},
						},
					],
				},
			},
		],
	});
	const current = currentVariant(board);
	if (current === undefined) throw new Error("no current variant");
	const locality = await lens
		.createVariantLocality()
		.read(scratch, board, current, new Date("2000-01-01"));
	const footprint = await lens.readVariantFootprint({
		vault: scratch,
		document: board,
		against: current,
		base: baseCommit,
	});
	if (footprint.proposal !== null) throw new Error("no proposal expected");

	expect(locality.hotspots.find((each) => each.subject.id === "device")?.commits).toEqual([
		editDeviceCommit,
		baseCommit,
	]);
	expect(locality.hotspots.find((each) => each.subject.id === "host")?.commits).toEqual([
		editSiblingCommit,
		baseCommit,
	]);
	expect(locality.hotspots.find((each) => each.subject.id === "modDev")?.commits).toEqual([
		editModuleCommit,
		baseCommit,
	]);
	expect(locality.hotspots.find((each) => each.subject.id === "modHost")?.commits).toEqual([
		baseCommit,
	]);

	expect(footprint.changed.find((each) => each.subject.id === "device")?.commits).toEqual([
		editDeviceCommit,
	]);
	expect(footprint.changed.find((each) => each.subject.id === "host")?.commits).toEqual([
		editSiblingCommit,
	]);
	expect(footprint.changed.find((each) => each.subject.id === "modDev")?.commits).toEqual([
		editModuleCommit,
	]);
	expect(footprint.changed.find((each) => each.subject.id === "modHost")).toBeUndefined();
});
