import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CodeTargetOpenFailureSchema } from "../../../src/shared/code-target/index.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

test("preguards opener bodies before parsing and handles activation after the write boundary", () => {
	const application = readFileSync(join(repoRoot, "src/server/canvas/lib/application.ts"), "utf8");
	const cors = application.indexOf("app.use(cors());");
	const preguards = [...application.matchAll(/app\.use\(createCodeOpenerPreguard\(\)\);/g)];
	const openerMounts = [...application.matchAll(/app\.use\(createCodeOpenerRouter\(\)\);/g)];
	const globalJson = application.indexOf('const globalJson = express.json({ limit: "10mb" });');
	const bypass = application.indexOf(
		"if (isCodeOpenerBodyRoute(req.method, req.path)) return next();",
	);
	const boundary = application.indexOf(
		"app.use((req: Request, res: Response, next: NextFunction) => {",
		application.indexOf("const NOT_A_BOARD_WRITE"),
	);

	expect(cors).toBeGreaterThanOrEqual(0);
	expect(preguards).toHaveLength(1);
	expect(openerMounts).toHaveLength(1);
	expect(globalJson).toBeGreaterThan(cors);
	expect(preguards[0]?.index).toBeGreaterThan(cors);
	expect(preguards[0]?.index).toBeLessThan(globalJson);
	expect(bypass).toBeGreaterThan(globalJson);
	expect(bypass).toBeLessThan(boundary);
	expect(openerMounts[0]?.index).toBeGreaterThan(boundary);
});

test("the public activation reaches its exemption before its handler", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-opener-boundary-"));
	resources.defer(() => rmSync(root, { recursive: true }));
	const vault = join(root, "vault");
	mkdirSync(vault);
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { ARCHBOARD_OPENER_CONFIG: join(root, "opener.json") },
	});
	resources.defer(() => canvas.dispose());
	const response = await fetch(`${canvas.base}/api/code-targets/open?expectVersion=bad`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: canvas.base,
			"Sec-Fetch-Site": "same-origin",
		},
		body: JSON.stringify({ board: "scratch", element: "missing" }),
	});
	const reply = CodeTargetOpenFailureSchema.parse(await response.json());

	expect(response.status).toBe(400);
	expect(reply).toMatchObject({
		code: "REQUEST_INVALID",
		error: "Activation query parameters are not accepted.",
	});
});

test("exempts activation from the board-write lock for its approved reason", () => {
	const application = readFileSync(join(repoRoot, "src/server/canvas/lib/application.ts"), "utf8");
	const exemptionsAt = application.indexOf("const NOT_A_BOARD_WRITE");
	const middleware = application.indexOf(
		"app.use((req: Request, res: Response, next: NextFunction) => {",
		exemptionsAt,
	);
	const exemptions = application.slice(exemptionsAt, middleware);
	const route = exemptions.indexOf("/^\\/api\\/code-targets\\/open$/");
	const reason = exemptions.indexOf(
		'"reads canonical board state and launches a process but writes no note"',
		route,
	);
	const tuple = exemptions.slice(
		exemptions.lastIndexOf("[", route),
		exemptions.indexOf("]", reason) + 1,
	);

	expect(route).toBeGreaterThanOrEqual(0);
	expect(reason).toBeGreaterThan(route);
	expect(tuple).toContain("/^\\/api\\/code-targets\\/open$/");
	expect(tuple).toContain(
		'"reads canonical board state and launches a process but writes no note"',
	);
});

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
