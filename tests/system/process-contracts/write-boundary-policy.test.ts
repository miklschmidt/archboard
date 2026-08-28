import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");

test("all note-changing routes cross the sole lock and write boundary", () => {
	const application = readFileSync(join(repoRoot, "src/server/canvas/lib/application.ts"), "utf8");
	const boardWrite = readFileSync(join(repoRoot, "src/runtime/engine/board-write.ts"), "utf8");
	const exemptionsAt = application.indexOf("const NOT_A_BOARD_WRITE");
	const middleware = application.indexOf(
		"app.use((req: Request, res: Response, next: NextFunction) => {",
		exemptionsAt,
	);
	const firstRoute = application.indexOf('app.post("/api/elements"');
	expect(middleware).toBeGreaterThan(exemptionsAt);
	expect(middleware).toBeLessThan(firstRoute);
	const boundary = application.slice(middleware, firstRoute);
	expect(boundary).toContain('if (req.method === "GET" || req.method === "HEAD") return next();');
	expect(boundary).toContain("NOT_A_BOARD_WRITE.some(([pattern]) => pattern.test(req.path))");
	expect(boundary.match(/holdBoard\(\{ board: key, holder: writer \}\)/g)).toHaveLength(1);
	expect(boundary.indexOf("holdBoard({ board: key, holder: writer })")).toBeLessThan(
		boundary.lastIndexOf("next();"),
	);
	const routeMatches = [...application.matchAll(/app\.(post|put|delete)\("([^"]+)"/g)];
	const changingRoutes = routeMatches.filter((route, index) => {
		const next = routeMatches[index + 1];
		return application
			.slice(route.index, next?.index ?? application.length)
			.includes("answerBoardWrite(res, {");
	});
	expect(changingRoutes.map((route) => `${route[1]} ${route[2]}`)).toEqual([
		"post /api/elements",
		"post /api/bridges",
		"delete /api/bridges/:id",
		"put /api/elements/:id",
		"delete /api/elements/clear",
		"delete /api/elements/:id",
		"post /api/elements/batch",
		"post /api/elements/changes",
		"post /api/files",
		"delete /api/files/:id",
		"post /api/boards/save",
	]);
	for (const route of changingRoutes) expect(route.index).toBeGreaterThan(middleware);
	const exemptions = application.slice(exemptionsAt, middleware);
	const exemptionPatterns = [...exemptions.matchAll(/\[\/\^((?:\\.|[^/])*)\/\s*,/g)].map(
		(match) => new RegExp(`^${match[1]}`),
	);
	for (const route of changingRoutes)
		expect(exemptionPatterns.some((pattern) => pattern.test(route[2]!))).toBeFalse();
	expect(application.match(/answerBoardWrite\(res, \{/g)).toHaveLength(11);
	const wrapper = application.slice(
		application.indexOf("function answerBoardWrite"),
		application.indexOf("function answerBoardWrite") + 1_000,
	);
	expect(wrapper.match(/writeBoard\s*\(/g)).toHaveLength(1);
	expect(application).not.toContain("writeBoardContent(");
	expect(application).not.toContain("applyElementInput(");
	expect(boardWrite.match(/writeBoardContent\(/g)).toHaveLength(1);
	expect(boardWrite.match(/type: "elements_changed"/g)).toHaveLength(1);
});
