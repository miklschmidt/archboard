import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import {
	moduleExposure,
	moduleOf,
} from "#runtime/operations/code-facts/modules/module-exposure.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"flake/flake.nix":
		'{ outputs = { self }: { lib.version = 1; packages.x86_64-linux.default = "private-default"; }; }\n',
	"other/flake.nix": "{ outputs = { self }: {}; }\n",
	"chart/Chart.yaml": "apiVersion: v2\nname: cart\nversion: 1.0.0\n",
	"chart/values.yaml": [
		"replicas: 2",
		"image:",
		"  repository: private-default",
		"  tag: { stable: current }",
		"ports: [80, 443]",
		"empty: {}",
		"",
	].join("\n"),
	"chart/templates/service.yaml": "apiVersion: v1\nkind: Service\nmetadata:\n  name: cart\n",
	"plain/values.yaml": "replicas: 2\n",
	"compose/compose.yaml": "services:\n  cart:\n    image: cart\n",
	"k8s/service.yaml": "apiVersion: v1\nkind: Service\nmetadata:\n  name: cart\n",
	"broken/Chart.yaml": "apiVersion: v2\nname: broken\nversion: 1.0.0\n",
	"broken/values.yaml": "image: [\n",
});
const facts = createCodeFacts();
afterAll(() => checkout.remove());

test("flake output paths are exposed names, with the flake as the module entry file", async () => {
	const pass = facts.pass(new AbortController().signal);
	const exposure = await moduleExposure(pass, checkout, "flake");
	expect(moduleOf("flake/flake.nix", "file")).toBe("flake");
	expect(exposure?.rootFiles).toEqual(["flake/flake.nix"]);
	expect(exposure?.exposed.map(({ name, path, member }) => [name, path, member])).toEqual([
		["lib", "flake/flake.nix", false],
		["lib.version", "flake/flake.nix", false],
		["packages", "flake/flake.nix", false],
		["packages.x86_64-linux", "flake/flake.nix", false],
		["packages.x86_64-linux.default", "flake/flake.nix", false],
	]);
	expect(exposure?.outside).toEqual(["other/flake.nix"]);
});

test("Helm values expose dotted key paths and source spans without their default values", async () => {
	const pass = facts.pass(new AbortController().signal);
	const exposure = await moduleExposure(pass, checkout, "chart");
	expect(moduleOf("chart/Chart.yaml", "file")).toBe("chart");
	expect(moduleOf("chart/values.yaml", "file")).toBe("chart");
	expect(exposure?.rootFiles).toEqual(["chart/values.yaml"]);
	expect(
		exposure?.exposed.map(({ name, definition }) => [name, definition.start, definition.end]),
	).toEqual([
		["replicas", 1, 1],
		["image", 2, 4],
		["image.repository", 3, 3],
		["image.tag", 4, 4],
		["image.tag.stable", 4, 4],
		["ports", 5, 5],
		["empty", 6, 6],
	]);
	expect(exposure?.exposed.every((name) => name.member === false)).toBe(true);
	expect(exposure?.outside).not.toContain("chart/templates/service.yaml");
	expect(JSON.stringify(exposure)).not.toContain("private-default");
});

test("ordinary YAML, compose files and plain manifests have no exposed module interface", async () => {
	const pass = facts.pass(new AbortController().signal);
	for (const directory of ["plain", "compose", "k8s"]) {
		expect(await moduleExposure(pass, checkout, directory)).toBeUndefined();
	}
	expect((await pass.read(checkout, "plain/values.yaml"))?.adapter).toBe("text");
	expect((await pass.read(checkout, "compose/compose.yaml"))?.adapter).toBe("compose");
	expect((await pass.read(checkout, "k8s/service.yaml"))?.adapter).toBe("kubernetes");
});

test("malformed chart values keep the parse skip and cannot invent exposed names", async () => {
	const pass = facts.pass(new AbortController().signal);
	const read = await pass.read(checkout, "broken/values.yaml");
	expect(read?.adapter).toBe("helm");
	if (read?.adapter !== "helm") throw new Error("not a values reading");
	expect(read.definitions).toEqual([]);
	expect(read.unparsed).toEqual([{ start: 1, end: 2, names: ["image"] }]);
	expect((await moduleExposure(pass, checkout, "broken"))?.exposed).toEqual([]);
});
