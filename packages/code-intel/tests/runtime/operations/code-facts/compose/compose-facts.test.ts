// The code facts of compose files (ADR 0046, TASK-367.20), read from the
// fixture project `fixtures/compose-shop`: services, networks and volumes as
// definitions, the entries that join services as configured paths resolved
// through the project as compose merges it, and env files read for their
// names alone.
//
// The project: `compose.yaml` runs `web`, which links to `api` and reads
// the cache through `CACHE_URL`; `api`, which depends on `db`, reaches it
// through `DATABASE_URL`, shares the `static` volume with `web` and reads
// `api.env`; and `db`, whose network alias is `database`.
// `compose.override.yml` adds `cache` and a dependency of `web` on it,
// replaces two of `api`'s environment values, and mounts a host directory
// where `api` mounts the `uploads` volume. `api.env` holds secrets.

import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { type FileFacts, type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { FIXTURES, fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const FIXTURE = join(FIXTURES, "compose-shop");
const checkout = fixtureCheckout(
	Object.fromEntries(
		readdirSync(FIXTURE).map((name) => [name, readFileSync(join(FIXTURE, name), "utf8")]),
	),
);
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @param from The checkout, the fixture project unless named.
 * @returns Its facts.
 */
async function read(relative: string, from = checkout): Promise<FileFacts | undefined> {
	return facts.pass(new AbortController().signal).read(from, relative);
}

/**
 * Read one file as compose.
 * @param relative The file.
 * @param from The checkout, the fixture project unless named.
 * @returns Its facts.
 */
async function compose(relative: string, from = checkout): Promise<SyntaxFacts> {
	const found = await read(relative, from);
	if (found?.adapter !== "compose") throw new Error(`${relative} was not read as compose`);
	return found;
}

/**
 * Each configured path of a file: its line, its address, and the file and
 * declaration it resolves to, if any.
 * @param file The file's facts.
 * @returns One row per reference.
 */
function configuredPaths(file: SyntaxFacts): string[] {
	return file.references
		.filter((each) => each.kind === "configured-path")
		.map((each) => {
			const to = each.target === undefined ? "-" : `${each.target.path} ${each.target.symbol}`;
			return `${each.line} ${each.symbol} -> ${to}`;
		});
}

test("a compose file defines its services, networks and volumes, each spanning its block", async () => {
	const base = await compose("compose.yaml");
	expect(base.definitions.map((each) => [each.symbol, each.visibility, each.exposed])).toEqual([
		["services.web", "published", true],
		["services.api", "internal", false],
		["services.db", "internal", false],
		["networks.back", "internal", false],
		["volumes.static", "internal", false],
		["volumes.uploads", "internal", false],
		["volumes.pgdata", "internal", false],
	]);
	expect(base.definitions.find((each) => each.symbol === "services.api")).toMatchObject({
		start: 19,
		end: 35,
	});
	expect(findSymbol(base, "api", "definition")).toMatchObject({ status: "found", line: 19 });
});

test("dependencies, links to networks and volumes and environment values that name a service are configured paths, resolved where the project declares them", async () => {
	const base = await compose("compose.yaml");
	expect(configuredPaths(base)).toEqual([
		// A link, whose value is interpolated with the default the file writes.
		"13 services.api -> compose.yaml services.api",
		// `cache` is declared only in the override.
		"15 services.cache -> compose.override.yml services.cache",
		"17 volumes.static -> compose.yaml volumes.static",
		"22 services.db -> compose.yaml services.db",
		// The override replaces DATABASE_URL and REPORTS_URL, so these lead nowhere.
		"26 services.db -> -",
		"27 services.web -> -",
		// The API writes the volume the read-only web front mounts: a shared volume.
		"32 volumes.static -> compose.yaml volumes.static",
		"32 services.web -> compose.yaml services.web",
		// The override mounts a host directory at the same target.
		"33 volumes.uploads -> -",
		"35 networks.back -> compose.yaml networks.back",
		"41 volumes.pgdata -> compose.yaml volumes.pgdata",
		"43 networks.back -> compose.yaml networks.back",
	]);
	// The environment names a service sets are environment references at their lines.
	expect(
		base.references
			.filter((each) => each.via === "environment")
			.map((each) => `${each.line} ${each.symbol}`),
	).toEqual(["15 CACHE_URL", "24 LOG_LEVEL", "26 DATABASE_URL", "27 REPORTS_URL", "28 SMTP_HOST"]);
});

test("the override merges over the base in compose's order: its dependencies add up and its values win, and an alias reaches its service", async () => {
	const override = await compose("compose.override.yml");
	expect(configuredPaths(override)).toEqual([
		"5 services.cache -> compose.override.yml services.cache",
		// `database` is the network alias of `db`.
		"8 services.database -> compose.yaml services.db",
	]);
	// The block of a service the override adds to is a definition of that file too.
	expect(override.definitions.map((each) => each.symbol)).toEqual([
		"services.web",
		"services.api",
		"services.cache",
	]);
});

test("an env file gives the names it sets and never a value, read through the compose file or on its own", async () => {
	const base = await compose("compose.yaml");
	const envFile = base.imports.find((each) => each.reexport);
	expect(envFile?.resolved).toBe("api.env");
	expect(envFile?.names.map((each) => each.local)).toEqual([
		"DB_PASSWORD",
		"STRIPE_KEY",
		"MAIL_FROM",
	]);
	const own = await read("api.env");
	if (own?.adapter !== "env") throw new Error("api.env was not read as an env file");
	expect(own.references.map((each) => each.symbol)).toEqual([
		"DB_PASSWORD",
		"STRIPE_KEY",
		"MAIL_FROM",
	]);
	const everything = JSON.stringify([base, own, await compose("compose.override.yml")]);
	for (const secret of ["hunter2", "sk_live", "not-a-name", "change-me-in-base", "STILL_THE_KEY"]) {
		expect(everything).not.toContain(secret);
	}
});

test("compose reads the files it finds by name in a directory, and a file that is not YAML is one part that did not parse", async () => {
	const other = fixtureCheckout({
		"deploy/compose.yaml": [
			"services:",
			"  web:",
			"    depends_on: [worker]",
			"    env_file: /etc/web.env",
			"  worker: {}",
			"  vpn:",
			"    network_mode: service:worker",
			"",
		].join("\n"),
		// Any mode replaces the base's, so `vpn` no longer runs in `worker`'s network.
		"deploy/compose.override.yaml": "services:\n  vpn:\n    network_mode: host\n",
		// An absolute env file is outside the checkout, whatever the checkout holds there.
		"deploy/etc/web.env": "WEB_SECRET=x\n",
		// Compose reads compose.yaml here, so this file is a project of its own.
		"deploy/docker-compose.yml": "services:\n  web:\n    depends_on: [worker]\n",
		// A file named for `-f` merges only as a command says.
		"deploy/compose.prod.yaml": "services:\n  web: {}\n",
		"broken/compose.yaml": "services:\n  web:\n    image: [unclosed\n",
	});
	try {
		const deploy = await compose("deploy/compose.yaml", other);
		expect(configuredPaths(deploy)).toEqual([
			"3 services.worker -> deploy/compose.yaml services.worker",
			"7 services.worker -> -",
		]);
		expect(deploy.imports.find((each) => each.reexport)?.resolved).toBeUndefined();
		expect(configuredPaths(await compose("deploy/docker-compose.yml", other))).toEqual([
			"3 services.worker -> -",
		]);
		expect((await read("deploy/compose.prod.yaml", other))?.adapter).toBe("text");
		const broken = await compose("broken/compose.yaml", other);
		expect(broken.definitions).toEqual([]);
		expect(findSymbol(broken, "services.web", "definition").status).toBe("unparsed");
	} finally {
		other.remove();
	}
});

test("a definition spans its block whatever its values hold: a bracket in a plain value is text, and a flow collection runs to its closing bracket", async () => {
	const other = fixtureCheckout({
		"compose.yaml": [
			"services:",
			"  web:",
			"    command: echo [",
			"    depends_on: [api,",
			"      db]",
			"  api: {}",
			"  db:",
			"    image: postgres:16",
			"",
		].join("\n"),
	});
	try {
		const file = await compose("compose.yaml", other);
		expect(file.definitions.map((each) => [each.symbol, each.start, each.end])).toEqual([
			["services.web", 2, 5],
			["services.api", 6, 6],
			["services.db", 7, 8],
		]);
	} finally {
		other.remove();
	}
});
