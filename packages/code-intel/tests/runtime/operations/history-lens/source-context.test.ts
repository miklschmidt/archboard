// Historical declarations retain the companion sources their adapter needs.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVariantFootprint } from "#runtime/operations/history-lens/footprint.ts";
import {
	currentVariant,
	SemanticBoardSchema,
	SEMANTIC_BOARD_SCHEMA_VERSION,
} from "@archboard/board/document";

test("bound declarations retain historical C, Objective-C and Nix parser context outside their binding", async () => {
	const scratch = mkdtempSync(join(tmpdir(), "archboard-source-context-"));
	const root = join(scratch, "repo");
	const registry = join(scratch, "repos.json");
	const previous = process.env["ARCHBOARD_REPOS"];
	const repo = "github.com/test/source-context";
	mkdirSync(root);
	const git = (...args: string[]): string => {
		const result = Bun.spawnSync(
			["git", "-c", "user.name=Owner", "-c", "user.email=owner@example.com", ...args],
			{
				cwd: root,
				env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
			},
		);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
		return result.stdout.toString().trim();
	};
	const commit = (): string => {
		git("add", "-A");
		git("commit", "-q", "--no-gpg-sign", "-m", "fixture");
		return git("rev-parse", "HEAD");
	};
	const header = (first: number, second: number): void => {
		writeFileSync(
			join(root, "api.h"),
			`static int template(void) { return ${first}; }\nstatic int neighbor(void) { return ${second}; }\n`,
		);
		writeFileSync(
			join(root, "API.m"),
			`SHOP_AUDIT_BEGIN\n@interface Ledger : NSObject\n- (int)first:(int)value${first};\n- (int)neighbor:(int)value${second};\n@end\nSHOP_AUDIT_END\n`,
		);
		writeFileSync(
			join(root, "flake.nix"),
			`{\n description = "${second}";\n outputs = import ./outputs${first}.nix;\n}\n`,
		);
	};
	try {
		git("init", "-q", "-b", "main");
		git("remote", "add", "origin", `https://${repo}.git`);
		writeFileSync(
			registry,
			JSON.stringify([{ repo, root, source: "declared", addedAt: "2026-10-07T00:00:00.000Z" }]),
		);
		process.env["ARCHBOARD_REPOS"] = registry;
		writeFileSync(join(root, "api.c"), '#include "api.h"\n');
		mkdirSync(join(root, "Shared"));
		writeFileSync(
			join(root, "Shared/Macros.h"),
			"#define SHOP_AUDIT_BEGIN NS_HEADER_AUDIT_BEGIN\n#define SHOP_AUDIT_END NS_HEADER_AUDIT_END\n",
		);
		for (const index of [0, 1])
			writeFileSync(join(root, `outputs${index}.nix`), '{ self }: { lib.version = "1"; }\n');
		header(0, 0);
		const base = commit();
		header(1, 0);
		const changed = commit();
		header(1, 1);
		commit();
		// A dirty companion must never select the historical header's grammar.
		rmSync(join(root, "api.c"));
		writeFileSync(join(root, "api.cpp"), '#include "api.h"\n');
		writeFileSync(join(root, "Shared/Macros.h"), "");
		writeFileSync(join(root, "outputs1.nix"), "{ self }: {}\n");
		const board = SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "board1",
			name: "API",
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
								id: "api",
								name: "API",
								kind: "module",
								order: 1000,
								binding: { repo, path: "api.h", symbol: "template" },
							},
							{
								id: "objc",
								name: "Objective-C",
								kind: "module",
								order: 2000,
								binding: { repo, path: "API.m", symbol: "Ledger::first:" },
							},
							{
								id: "nix",
								name: "Nix",
								kind: "module",
								order: 3000,
								binding: { repo, path: "flake.nix", symbol: "lib.version" },
							},
						],
					},
				},
			],
		});
		const current = currentVariant(board);
		if (current === undefined) throw new Error("Missing current variant");
		const answer = await readVariantFootprint({ vault: scratch, board, against: current, base });
		if (answer.proposal !== null) throw new Error("Unexpected proposal");
		expect(answer.changed).toMatchObject([
			{
				subject: { id: "api" },
				commits: [changed],
				attribution: { mode: "symbol", symbol: "template" },
			},
			{
				subject: { id: "objc" },
				commits: [changed],
				attribution: { mode: "symbol", symbol: "Ledger::first:" },
			},
			{
				subject: { id: "nix" },
				commits: [changed],
				attribution: { mode: "symbol", symbol: "lib.version" },
			},
		]);
	} finally {
		if (previous === undefined) delete process.env["ARCHBOARD_REPOS"];
		else process.env["ARCHBOARD_REPOS"] = previous;
		rmSync(scratch, { recursive: true, force: true });
	}
});
