import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "#shared/schemas/code-target-open.ts";
import {
	createOpenerFixture,
	jsonBody,
	type OpenerFixture,
} from "#tests/server/support/opener-fixture.ts";

const LEDGER = `// The ledger.
export const rate = 3;

export class Ledger {
	post(): void {}
}

export function settle(): void {}
`;

const REPOSITORY = "github.com/acme/payments";

/**
 * A fixture whose opener writes the line it was given beside the path, and whose
 * `src/ledger.ts` defines `Ledger.post` on line 5 and `settle` on line 8.
 * @param resources Where the fixture and the opener are released.
 * @returns The fixture and its opener.
 */
async function openerAtLine(resources: AsyncDisposableStack) {
	const fixture = await createOpenerFixture();
	resources.defer(() => fixture.dispose());
	writeFileSync(join(fixture.checkout, "src", "ledger.ts"), LEDGER);
	const invocation = fixture.invocation("immediate", ["--at={line}"]);
	resources.defer(() => invocation.releaseAndWait());
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);
	return { fixture, invocation };
}

/**
 * Open the bound element of the fixture.
 * @param fixture The fixture.
 * @returns The route's answer.
 */
function open(fixture: OpenerFixture) {
	return fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ board: "system/payments", element: "node" }),
	});
}

describe("open code at the bound symbol", () => {
	test("opens the file at the line that defines the symbol", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		fixture.writeBinding({ repo: REPOSITORY, path: "src/ledger.ts", symbol: "Ledger.post" });

		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/ledger.ts"),
			extra: ["--at=5"],
		});
	});

	// Each way to have no line (no symbol, a directory, text) is the symbol-line owner's.
	test("opens the file as it always did where the file does not define the symbol", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		fixture.writeBinding({ repo: REPOSITORY, path: "src/ledger.ts", symbol: "missing" });

		const result = await open(fixture);
		expect(result.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({ success: true });
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/ledger.ts"),
			extra: ["--at=1"],
		});
	});

	test("the GitHub link names the line when the opener fails, and never for a checkout on another ref", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		for (const args of [
			["checkout", "-q", "-b", "work"],
			["commit", "-q", "--allow-empty", "-m", "first"],
		]) {
			Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
				cwd: fixture.checkout,
			});
		}
		const missing = {
			version: 1,
			kind: "custom",
			executable: join(fixture.root, "none"),
			argv: ["{path}"],
		};
		expect(
			(await fixture.request("/api/settings/opener", { method: "PUT", body: jsonBody(missing) }))
				.status,
		).toBe(200);

		// On the bound branch the line was read from the ref that the link names.
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "src/ledger.ts",
			symbol: "settle",
			branch: "work",
		});
		const here = await open(fixture);
		expect(CodeTargetOpenReplySchema.parse(here.body)).toMatchObject({
			code: "OPENER_UNAVAILABLE",
			actions: [
				{ kind: "settings" },
				{ kind: "github", href: "https://github.com/acme/payments/blob/work/src/ledger.ts#L8" },
			],
		});

		// On another ref the working tree is another version: GitHub gets the file and no line.
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "src/ledger.ts",
			symbol: "settle",
			branch: "release/2.1",
		});
		const elsewhere = await open(fixture);
		expect(CodeTargetOpenReplySchema.parse(elsewhere.body)).toMatchObject({
			code: "CHECKOUT_ON_OTHER_REF",
			actions: [
				{
					kind: "github",
					href: "https://github.com/acme/payments/tree/release%2F2.1/src/ledger.ts",
				},
			],
		});
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});

	test("opens a Terraform local-module nested block at the module file and line from root directory or root file bindings", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		mkdirSync(join(fixture.checkout, "infra", "gw"), { recursive: true });
		writeFileSync(
			join(fixture.checkout, "infra", "main.tf"),
			`module "gw" {\n  count  = 1\n  source = "./gw"\n}\n`,
		);
		writeFileSync(
			join(fixture.checkout, "infra", "gw", "main.tf"),
			`resource "azurerm_application_gateway" "ingress" {\n  http_listener {\n    name = "device"\n  }\n}\n`,
		);
		const symbol = 'module.gw[0].azurerm_application_gateway.ingress.http_listener["device"]';

		fixture.writeBinding({ repo: REPOSITORY, path: "infra", symbol });
		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "infra/gw/main.tf"),
			extra: ["--at=2"],
		});

		fixture.writeBinding({ repo: REPOSITORY, path: "infra/main.tf", symbol });
		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "infra/gw/main.tf"),
			extra: ["--at=2"],
		});
	});

	test("excludes Git-ignored Terraform local modules and uses the resolved module path in the GitHub fallback", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		mkdirSync(join(fixture.checkout, "infra", "gw"), { recursive: true });
		mkdirSync(join(fixture.checkout, "infra", "ignored"), { recursive: true });
		writeFileSync(join(fixture.checkout, ".gitignore"), "infra/ignored/\n");
		writeFileSync(
			join(fixture.checkout, "infra", "main.tf"),
			[
				'module "gw" {',
				"  count  = 1",
				'  source = "./gw"',
				"}",
				'module "hidden" {',
				'  source = "./ignored"',
				"}",
			].join("\n"),
		);
		writeFileSync(
			join(fixture.checkout, "infra", "gw", "main.tf"),
			'resource "azurerm_application_gateway" "ingress" {\n  http_listener {\n    name = "device"\n  }\n}\n',
		);
		writeFileSync(
			join(fixture.checkout, "infra", "ignored", "secret.tf"),
			'resource "azurerm_application_gateway" "ingress" {\n  http_listener {\n    name = "secret"\n  }\n}\n',
		);

		// R2 #3: Git-ignored local module must not resolve or open ignored/secret.tf.
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "infra/main.tf",
			symbol: 'module.hidden.azurerm_application_gateway.ingress.http_listener["secret"]',
		});
		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "infra/main.tf"),
			extra: ["--at=1"],
		});

		// R2 #5: Unavailable editor falls back to GitHub using the resolved child module file + line and binding ref.
		for (const args of [
			["checkout", "-q", "-b", "work"],
			["add", ".gitignore", "infra/main.tf", "infra/gw/main.tf"],
			["commit", "-q", "--no-gpg-sign", "-m", "infra"],
		]) {
			const run = Bun.spawnSync(
				["git", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
				{ cwd: fixture.checkout },
			);
			expect(run.exitCode).toBe(0);
		}
		const missing = {
			version: 1,
			kind: "custom",
			executable: join(fixture.root, "no-such-editor"),
			argv: ["{path}"],
		};
		expect(
			(await fixture.request("/api/settings/opener", { method: "PUT", body: jsonBody(missing) }))
				.status,
		).toBe(200);
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "infra/main.tf",
			branch: "work",
			symbol: 'module.gw[0].azurerm_application_gateway.ingress.http_listener["device"]',
		});
		const unavailable = await open(fixture);
		expect(unavailable.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(unavailable.body)).toMatchObject({
			code: "OPENER_UNAVAILABLE",
			actions: [
				{ kind: "settings" },
				{
					kind: "github",
					href: "https://github.com/acme/payments/blob/work/infra/gw/main.tf#L2",
				},
			],
		});
	});

	test("does not parse a directly bound Git-ignored Terraform file for a symbol line", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		mkdirSync(join(fixture.checkout, "infra", "ignored"), { recursive: true });
		writeFileSync(join(fixture.checkout, ".gitignore"), "infra/ignored/\n");
		writeFileSync(
			join(fixture.checkout, "infra", "ignored", "secret.tf"),
			'resource "azurerm_application_gateway" "ingress" {\n  http_listener {\n    name = "secret"\n  }\n}\n',
		);
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "infra/ignored/secret.tf",
			symbol: 'azurerm_application_gateway.ingress.http_listener["secret"]',
		});
		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "infra/ignored/secret.tf"),
			extra: ["--at=1"],
		});
	});
});
