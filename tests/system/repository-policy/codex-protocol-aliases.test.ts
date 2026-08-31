import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
	aliasContext,
	aliasResolutions,
	configuredAliases,
} from "./support/codex-protocol-aliases.js";

function fixtureRoot(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-codex-aliases-"));
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({
			imports: {
				"#conditional/*": {
					browser: "./ordinary/*",
					default: ["./ordinary/*", "./src/runtime/codex-protocol/generated/*"],
				},
			},
		}),
	);
	fs.writeFileSync(
		path.join(root, "tsconfig.base.json"),
		`{
			// inherited JSONC paths
			"compilerOptions": {
				"baseUrl": ".",
				"paths": {
					"@/*": ["ordinary/*", "fallback/*"],
					"@/codex/*": ["src/runtime/codex-protocol/generated/*"],
					"#fallback/*": ["ordinary/*", "src/runtime/codex-protocol/generated/*"],
				},
			},
		}
		`,
	);
	fs.writeFileSync(
		path.join(root, "tsconfig.json"),
		`{
			"extends": "./tsconfig.base.json",
			"compilerOptions": { "strict": true, },
			"include": ["src/**/*.ts"],
		}
		`,
	);
	fs.writeFileSync(
		path.join(root, "tsconfig.frontend.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: ".",
				paths: { "@/*": ["frontend-ordinary/*"] },
			},
			include: ["src/ui/**/*.ts"],
		}),
	);
	fs.writeFileSync(
		path.join(root, "vite.config.js"),
		`export default {
			resolve: {
				alias: [
					{ find: "#vite-ordinary", replacement: "${root}/ordinary" },
					{ find: /^#vite-(.*)$/, replacement: "${root}/src/runtime/codex-protocol/generated/$1" },
				],
			},
		};
		`,
	);
	return root;
}

describe("Codex protocol alias ownership support", () => {
	test("preserves project context, precedence, fallbacks, conditions, and Vite regex aliases", async () => {
		const root = fixtureRoot();
		const objectRoot = fixtureRoot();
		try {
			const aliases = await configuredAliases(root);
			expect(aliases.errors).toEqual([]);
			expect(aliasContext("src/server/request.ts")).toBe("root");
			expect(aliasContext("src/ui/request.ts")).toBe("frontend");
			expect(
				aliasResolutions(aliases, "src/server/request.ts", "@/codex/ClientRequest.js"),
			).toEqual([
				{
					kind: "tsconfig",
					target: path.join(root, "src/runtime/codex-protocol/generated/ClientRequest.js"),
				},
			]);
			expect(aliasResolutions(aliases, "src/server/request.ts", "@/ClientRequest.js")).toEqual([
				{ kind: "tsconfig", target: path.join(root, "ordinary/ClientRequest.js") },
				{ kind: "tsconfig", target: path.join(root, "fallback/ClientRequest.js") },
			]);
			expect(aliasResolutions(aliases, "src/ui/request.ts", "@/ClientRequest.js")).toEqual([
				{ kind: "tsconfig", target: path.join(root, "frontend-ordinary/ClientRequest.js") },
			]);
			expect(
				aliasResolutions(aliases, "src/server/request.ts", "#fallback/ClientRequest.js"),
			).toEqual([
				{ kind: "tsconfig", target: path.join(root, "ordinary/ClientRequest.js") },
				{
					kind: "tsconfig",
					target: path.join(root, "src/runtime/codex-protocol/generated/ClientRequest.js"),
				},
			]);
			expect(
				aliasResolutions(aliases, "src/server/request.ts", "#conditional/ClientRequest.js"),
			).toEqual([
				{ kind: "package", target: "./ordinary/ClientRequest.js" },
				{ kind: "package", target: "./ordinary/ClientRequest.js" },
				{ kind: "package", target: "./src/runtime/codex-protocol/generated/ClientRequest.js" },
			]);
			expect(aliasResolutions(aliases, "src/ui/request.ts", "#vite-ClientRequest.js")).toEqual([
				{
					kind: "vite",
					target: path.join(root, "src/runtime/codex-protocol/generated/ClientRequest.js"),
				},
			]);
			expect(aliasResolutions(aliases, "src/ui/request.ts", "#vite-ordinary")).toEqual([
				{ kind: "vite", target: path.join(root, "ordinary") },
			]);
			expect(
				aliasResolutions(aliases, "src/ui/request.ts", "#vite-ordinary/ClientRequest.js"),
			).toEqual([{ kind: "vite", target: path.join(root, "ordinary/ClientRequest.js") }]);
			fs.writeFileSync(
				path.join(objectRoot, "vite.config.js"),
				`export default { resolve: { alias: { "#vite-object": "${objectRoot}/ordinary" } } };\n`,
			);
			const objectAliases = await configuredAliases(objectRoot);
			expect(aliasResolutions(objectAliases, "src/ui/request.ts", "#vite-object")).toEqual([
				{ kind: "vite", target: path.join(objectRoot, "ordinary") },
			]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(objectRoot, { recursive: true, force: true });
		}
	});

	test("handles absent configuration without inventing an alias", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-codex-no-alias-"));
		try {
			fs.writeFileSync(path.join(root, "package.json"), "{}\n");
			const aliases = await configuredAliases(root);
			expect(aliases.errors).toEqual([]);
			expect(
				aliasResolutions(aliases, "src/server/request.ts", "#codex-generated/ClientRequest.js"),
			).toEqual([]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
