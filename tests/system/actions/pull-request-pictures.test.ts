// Exercise render failures and publication with real SVG files and a local assets repository.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "../../../actions/pull-request/context.ts";
import { makePictures } from "../../../actions/pull-request/pictures.ts";
import { scratch } from "./support.ts";

const headSha = "b".repeat(40);
const roots: string[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		fetch: () => Response.json({ head: { sha: headSha } }),
	});
});

afterAll(() => {
	server.stop(true);
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * Render from supplied files. An absent file represents a refused render.
 * @param files The SVG content by output name.
 * @returns The run and a reader for the published assets.
 */
function fixture(files: Readonly<Record<string, string>>) {
	const root = scratch();
	roots.push(root);
	const bare = join(root, "assets.git");
	expect(Bun.spawnSync(["git", "init", "-q", "--bare", bare]).exitCode).toBe(0);
	for (const [name, svg] of Object.entries(files)) writeFileSync(join(root, name), svg);
	const cli = join(root, "archboard");
	writeFileSync(
		cli,
		`#!/bin/sh
while [ "$#" -gt 0 ]; do
	if [ "$1" = --out ]; then
		cp "$(dirname "$0")/$(basename "$2")" "$2"
		exit "$?"
	fi
	shift
done
exit 2
`,
	);
	chmodSync(cli, 0o755);
	const context: Context = {
		cli,
		directory: root,
		scratch: root,
		subpath: "",
		extraCheckouts: [],
		hosting: { server: `file://${root}`, repository: "assets" },
		access: {
			url: `http://127.0.0.1:${String(server.port)}`,
			token: "test-token",
			repository: "owner/name",
		},
		branch: "archboard-assets",
		number: 7,
		baseSha: "a".repeat(40),
		baseRef: "main",
		headSha,
		labels: [],
		body: "",
		fromFork: false,
		mode: "warn",
		overrideLabel: "archboard: out of plan",
		stateInput: "",
	};
	return {
		context,
		trees: { baseDir: join(root, "base"), headDir: join(root, "head"), headRoot: root },
		published(name: string) {
			const result = Bun.spawnSync([
				"git",
				`--git-dir=${bare}`,
				"show",
				`archboard-assets:pr-7/${headSha}/${name}`,
			]);
			return result.exitCode === 0 ? result.stdout.toString() : undefined;
		},
	};
}

const whole = {
	"before-light.svg": '<svg data-theme="light"/>',
	"after-light.svg": '<svg data-theme="light"/>',
	"before-dark.svg": '<svg data-theme="dark"/>',
	"after-dark.svg": '<svg data-theme="dark"/>',
};

describe("pictures of an unchanged architecture", () => {
	test("keeps one whole picture when no module changed", async () => {
		const run = fixture(whole);
		const pictures = await makePictures(run.context, run.trees, undefined);
		expect(pictures.same).toBe("whole");
		expect(pictures.before).toBeUndefined();
		expect(pictures.after?.light).toEndWith("/after-light.svg");
		expect(pictures.after?.dark).toEndWith("/after-dark.svg");
		expect(pictures.map).toBe(pictures.after?.light);
		expect(pictures.note).toBeUndefined();
		expect(run.published("before-light.svg")).toBeUndefined();
		expect(run.published("before-dark.svg")).toBeUndefined();
	});

	test.each([
		{ light: true, dark: true },
		{ light: true, dark: false },
		{ light: false, dark: true },
		{ light: false, dark: false },
	])(
		"focus renders with light=$light and dark=$dark preserve a usable picture",
		async ({ light, dark }) => {
			const focus = '<svg data-focus="module"/>';
			const run = fixture({
				...whole,
				...(light ? { "focus-light.svg": focus } : {}),
				...(dark ? { "focus-dark.svg": focus } : {}),
			});
			const pictures = await makePictures(run.context, run.trees, undefined, ["m#module"]);
			expect(pictures.same).toBe(light ? "close-up" : "whole");
			expect(pictures.after?.light).toEndWith(light ? "/focus-light.svg" : "/after-light.svg");
			if (light && !dark) expect(pictures.after?.dark).toBeUndefined();
			else expect(pictures.after?.dark).toEndWith(light ? "/focus-dark.svg" : "/after-dark.svg");
			expect(pictures.before).toBeUndefined();
			expect(pictures.map).toEndWith("/after-light.svg");
			expect(run.published("after-light.svg")).toBe(whole["after-light.svg"]);
			if (light) expect(run.published("focus-light.svg")).toBe(focus);
		},
	);

	test("a refused publication exposes no picture or map links", async () => {
		const run = fixture({ ...whole, "focus-light.svg": "<svg/>", "focus-dark.svg": "<svg/>" });
		const context = {
			...run.context,
			hosting: { ...run.context.hosting, server: `${run.context.hosting.server}/missing` },
		};
		const pictures = await makePictures(context, run.trees, undefined, ["m#module"]);
		expect(pictures.before).toBeUndefined();
		expect(pictures.after).toBeUndefined();
		expect(pictures.map).toBeUndefined();
		expect(pictures.note).toBeDefined();
	});
});

test("a difference in only the dark theme preserves both sides", async () => {
	const run = fixture({
		...whole,
		"after-dark.svg": '<svg data-theme="dark" data-changed="yes"/>',
	});
	const pictures = await makePictures(run.context, run.trees, undefined, ["m#module"]);
	expect(pictures.same).toBeUndefined();
	expect(pictures.before?.light).toEndWith("/before-light.svg");
	expect(pictures.after?.light).toEndWith("/after-light.svg");
	expect(pictures.map).toBe(pictures.after?.light);
	expect(run.published("before-dark.svg")).toBe(whole["before-dark.svg"]);
});

test("an absent base architecture preserves the head and explains the missing before picture", async () => {
	const run = fixture({
		"after-light.svg": whole["after-light.svg"],
		"after-dark.svg": whole["after-dark.svg"],
	});
	const pictures = await makePictures(run.context, run.trees, undefined, ["m#module"]);
	expect(pictures.same).toBeUndefined();
	expect(pictures.before).toBeUndefined();
	expect(pictures.after?.light).toEndWith("/after-light.svg");
	expect(pictures.note).toBeDefined();
});
