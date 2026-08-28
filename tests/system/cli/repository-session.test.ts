import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { boardsForRepo } from "../../../src/runtime/engine/repo-boards.ts";
import { extractSceneJsonFromObsidianMd } from "../../../src/runtime/engine/obsidian-md.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { checkoutRoot } from "./support/package-cli.ts";
import { createRepositoryFixture, repositoryFailure } from "./support/repository-fixture.ts";

const objectSchema = z.record(z.string(), z.unknown());
const elementSchema = z
	.object({
		id: z.string(),
		link: z.string().nullable().optional(),
		customData: z
			.object({
				archboard: z
					.object({ binding: z.object({ repo: z.string(), path: z.string() }).optional() })
					.passthrough(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();
const apiResultSchema = z.object({ status: z.number(), body: objectSchema });
const boardListSchema = z
	.object({
		boards: z.array(
			z
				.object({
					key: z.string(),
					source: z.enum(["memory", "vault"]),
					nodes: z.array(z.unknown()),
				})
				.passthrough(),
		),
	})
	.passthrough();

const doingUrl = (path: string, method: string) => {
	if (method === "GET") return path;
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}doing=${encodeURIComponent("checking repository session")}`;
};

describe("two-repository board session", () => {
	test("keeps portable bindings and machine-local links separate", async () => {
		const fixture = createRepositoryFixture();
		const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
		const beta = fixture.repository("beta", "https://github.com/acme/beta.git");
		const alphaIdentity = "github.com/acme/alpha";
		const betaIdentity = "github.com/acme/beta";
		const canvas = await startOwnedCanvas({
			serverPath: join(checkoutRoot, "src/server.ts"),
			vault: fixture.vault,
			env: { ARCHBOARD_REPOS: fixture.registry },
		});
		const api = async (method: string, path: string, body?: unknown) => {
			const response = await fetch(`${canvas.base}${doingUrl(path, method)}`, {
				method,
				...(body === undefined
					? {}
					: { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
			});
			return apiResultSchema.parse({ status: response.status, body: await response.json() });
		};
		try {
			for (const checkout of [alpha, beta]) {
				const added = fixture.run(["repo", "add", checkout], { url: canvas.base });
				expect(added.status, repositoryFailure(added)).toBe(0);
			}
			const board = "systems";
			expect((await api("POST", "/api/boards/new", { board, level: "system" })).status).toBe(200);
			const addNode = async (x: number, label: string, link?: string) => {
				const result = await api("POST", `/api/elements?board=${board}`, {
					type: "rectangle",
					x,
					y: 0,
					width: 200,
					height: 80,
					label: { text: label },
					...(link ? { link } : {}),
				});
				return z.object({ element: z.object({ id: z.string() }) }).parse(result.body).element.id;
			};
			const alphaId = await addNode(0, "Alpha");
			const betaId = await addNode(300, "Beta");
			const docsId = await addNode(600, "Docs", "https://example.com/docs");
			const promote = (id: string, repo: string) =>
				fixture.run(
					[
						"promote",
						"--board",
						board,
						"--ids",
						id,
						"--kind",
						"service",
						"--repo",
						repo,
						"--path",
						"src/service.ts",
					],
					{ url: canvas.base },
				);
			const first = promote(alphaId, alphaIdentity);
			const second = promote(betaId, betaIdentity);
			expect(first.status, repositoryFailure(first)).toBe(0);
			expect(second.status, repositoryFailure(second)).toBe(0);
			expect(first.stdout).not.toContain(fixture.nowhere);
			expect(second.stdout).not.toContain(fixture.nowhere);
			expect(
				(
					await api("PUT", `/api/elements/${alphaId}?board=${board}`, {
						link: "https://example.com/wrong-local-link",
					})
				).status,
			).toBe(200);

			const elements = z
				.object({ elements: z.array(elementSchema) })
				.parse((await api("GET", `/api/elements?board=${board}`)).body).elements;
			const byId = new Map(elements.map((element) => [element.id, element]));
			expect(byId.get(alphaId)?.customData?.archboard.binding).toMatchObject({
				repo: alphaIdentity,
				path: "src/service.ts",
			});
			expect(byId.get(betaId)?.customData?.archboard.binding?.repo).toBe(betaIdentity);
			expect(byId.get(alphaId)?.link).toBe(`file://${alpha}/src/service.ts`);
			expect(byId.get(betaId)?.link).toBe(`file://${beta}/src/service.ts`);
			expect(byId.get(docsId)?.link).toBe("https://example.com/docs");

			const blind = fixture.run(
				[
					"promote",
					"--board",
					board,
					"--ids",
					betaId,
					"--kind",
					"service",
					"--path",
					"src/service.ts",
				],
				{ url: canvas.base },
			);
			expect(blind.status, repositoryFailure(blind)).toBe(0);
			expect(blind.stdout).toContain("does not resolve on this machine");
			expect(promote(betaId, betaIdentity).status).toBe(0);

			const notePath = join(fixture.vault, "systems.excalidraw.md");
			const rawNote = readFileSync(notePath, "utf8");
			const scene = z
				.object({ elements: z.array(elementSchema) })
				.parse(JSON.parse(extractSceneJsonFromObsidianMd(rawNote)));
			const persisted = new Map(scene.elements.map((element) => [element.id, element]));
			expect(persisted.get(alphaId)?.customData?.archboard.binding).toMatchObject({
				repo: alphaIdentity,
				path: "src/service.ts",
			});
			expect(persisted.get(alphaId)?.link).toBeUndefined();
			expect(persisted.get(betaId)?.link).toBeUndefined();
			expect(persisted.get(docsId)?.link).toBe("https://example.com/docs");
			expect(rawNote).not.toContain(`file://${alpha}/src/service.ts`);

			const fromAlpha = fixture.run(["board", "list", "--repo", alphaIdentity, "--text"], {
				url: canvas.base,
			});
			const fromBeta = fixture.run(["board", "list", "--repo", betaIdentity, "--text"], {
				url: canvas.base,
			});
			expect(fromAlpha.stdout).toContain("systems");
			expect(fromAlpha.stdout).toMatch(/Alpha \[service\] -> src\/service\.ts/);
			expect(fromAlpha.stdout).not.toMatch(/Beta \[/);
			expect(fromBeta.stdout).toContain("systems");
			const here = fixture.run(["board", "list", "--here", "--text"], {
				cwd: alpha,
				url: canvas.base,
			});
			expect(here.stdout).toContain("systems");
			expect(here.stderr).toContain(alphaIdentity);
			const nowhere = fixture.run(["board", "list", "--here", "--text"], { url: canvas.base });
			expect(nowhere.status).not.toBe(0);
			expect(nowhere.stderr).toContain("not inside a git repository");

			await api("POST", "/api/boards/new", { board: "drafts" });
			const draft = await api("POST", "/api/elements?board=drafts", {
				type: "rectangle",
				x: 0,
				y: 0,
				width: 200,
				height: 80,
				label: { text: "Draft" },
			});
			const draftId = z.object({ element: z.object({ id: z.string() }) }).parse(draft.body)
				.element.id;
			expect(
				fixture.run(
					[
						"promote",
						"--board",
						"drafts",
						"--ids",
						draftId,
						"--kind",
						"service",
						"--repo",
						alphaIdentity,
						"--path",
						"src/service.ts",
					],
					{ url: canvas.base },
				).status,
			).toBe(0);
			const withDraft = boardListSchema.parse(
				JSON.parse(
					fixture.run(["board", "list", "--repo", alphaIdentity], { url: canvas.base }).stdout,
				),
			);
			expect(withDraft.boards.find((entry) => entry.key === "drafts")?.source).toBe("memory");
			const fromVault = boardsForRepo(alphaIdentity, [], fixture.vault);
			expect(fromVault.boards).toContainEqual(
				expect.objectContaining({ key: "systems", source: "vault" }),
			);
		} finally {
			await canvas.dispose();
			fixture.dispose();
		}
	}, 30_000);
});
