import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	canonicalLinkAfterPresentationEcho,
	presentElement,
	stripBindingPresentationLink,
} from "../presentation.js";
import { completeElement } from "./support/elements.js";

const context = { boardKey: "system/archboard" } as const;
const humanLink = "https://human.example/board-note";
let fixture: ResolverFixture;
let previousRegistry: string | undefined;

interface ResolverFixture {
	checkout: string;
	repository: string;
	registry: string;
	dispose(): void;
}

function createResolverFixture(): ResolverFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-presentation-links-"));
	const checkout = join(root, "checkout");
	const registry = join(root, "state", "repos.json");
	const repository = "github.com/acme/payments";
	mkdirSync(join(checkout, "src"), { recursive: true });
	mkdirSync(join(root, "state"));
	writeFileSync(join(checkout, "src", "index.ts"), "export {};\n");
	const init = Bun.spawnSync(["git", "init", "-q"], { cwd: checkout });
	if (init.exitCode !== 0) throw new Error(init.stderr.toString());
	const remote = Bun.spawnSync(["git", "remote", "add", "origin", `https://${repository}.git`], {
		cwd: checkout,
	});
	if (remote.exitCode !== 0) throw new Error(remote.stderr.toString());
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
		]),
	);
	return { checkout, repository, registry, dispose: () => rmSync(root, { recursive: true }) };
}
beforeEach(() => {
	fixture = createResolverFixture();
	previousRegistry = process.env.ARCHBOARD_REPOS;
	process.env.ARCHBOARD_REPOS = fixture.registry;
});
afterEach(() => {
	if (previousRegistry === undefined) delete process.env.ARCHBOARD_REPOS;
	else process.env.ARCHBOARD_REPOS = previousRegistry;
	fixture.dispose();
});

function bound(link: string | null, binding = { repo: fixture.repository, path: "src/index.ts" }) {
	return completeElement({
		id: "bound",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 50,
		link,
		customData: { archboard: { binding } },
	});
}

function boardIdentityIsRequired() {
	// @ts-expect-error A presentation without its board identity is not a public operation.
	presentElement(bound(null));
}
void boardIdentityIsRequired;

test("local and GitHub presentations use exact current targets", () => {
	expect(presentElement(bound(humanLink), context).link).toBe(
		"/api/code-targets/open?board=system%2Farchboard&element=bound",
	);
	expect(
		presentElement(
			bound(humanLink, { repo: "github.com/acme/remote", path: "src/a b.ts" }),
			context,
		).link,
	).toBe("https://github.com/acme/remote/tree/HEAD/src/a%20b.ts");
});

test("exact internal, GitHub, opaque, and live legacy echoes restore the canonical link", () => {
	const canonical = bound(humanLink);
	const internal = "/api/code-targets/open?board=system%2Farchboard&element=bound";
	const github = "https://github.com/acme/payments/tree/HEAD/src/index.ts";
	const opaque = "opaque:replacement-owned-elsewhere";
	const legacy = pathToFileURL(`${fixture.checkout}/src/index.ts`).href;
	for (const incoming of [internal, github, legacy])
		expect(canonicalLinkAfterPresentationEcho(canonical, incoming, context)).toBe(humanLink);
	expect(
		canonicalLinkAfterPresentationEcho(canonical, opaque, { ...context, opaqueTarget: opaque }),
	).toBe(humanLink);
	expect(stripBindingPresentationLink({ ...canonical, link: internal }, context).link).toBeNull();
	expect(stripBindingPresentationLink({ ...canonical, link: github }, context).link).toBeNull();
});

test("near misses and ordinary links remain byte-for-byte", () => {
	const canonical = bound(humanLink);
	const values = [
		"/api/code-targets/open?board=other&element=bound",
		"/api/code-targets/open?board=system%2Farchboard&element=other",
		"https://github.com/acme/payments/tree/main/src/index.ts",
		"https://github.com/acme/payments/tree/HEAD/src/other.ts",
		"https://github.com/acme/other/tree/HEAD/src/index.ts",
		"https://human.example/other",
		"file:///tmp/human-authored.ts",
		"opaque:different",
	];
	for (const incoming of values) {
		expect(canonicalLinkAfterPresentationEcho(canonical, incoming, context)).toBe(incoming);
		expect(stripBindingPresentationLink({ ...canonical, link: incoming }, context).link).toBe(
			incoming,
		);
	}
});

test("a legacy file value is human-authored when its checkout is unavailable", () => {
	const canonical = bound(humanLink);
	const legacy = pathToFileURL(`${fixture.checkout}/src/index.ts`).href;
	writeFileSync(fixture.registry, "[]\n");
	expect(canonicalLinkAfterPresentationEcho(canonical, legacy, context)).toBe(legacy);
	expect(stripBindingPresentationLink({ ...canonical, link: legacy }, context).link).toBe(legacy);
});

test("opaque presentation is explicit and never mutates the canonical element", () => {
	const opaqueTarget = "opaque:replacement-owned-elsewhere";
	const canonical = bound(null, { repo: "other.example/acme/repo", path: "missing" });
	const presented = presentElement(canonical, { ...context, opaqueTarget });
	expect(presented.link).toBe(opaqueTarget);
	expect(canonical.link).toBeNull();
	expect(stripBindingPresentationLink(presented, { ...context, opaqueTarget }).link).toBeNull();
});
