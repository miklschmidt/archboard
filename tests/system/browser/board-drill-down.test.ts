import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BoardInfoResultSchema } from "../../../src/cli/commands/board.ts";
import { AddResultSchema, GetResultSchema } from "../../../src/cli/commands/elements.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	runCanvasCli,
} from "./support/agent-browser.ts";
import { activateLink, elementPoint } from "./support/element-link-interaction.ts";
import { serverPath, type PanesBody } from "./support/navigator-support.ts";
import { clickNavigatorRow, dismissNotice, shellNotices } from "./support/shell-dom.ts";

test("the skill's overview links to internals in the clicked pane and recovers a missing variant", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	const cli = (...args: string[]): string => runCanvasCli(canvas.base, vault, args);
	const info = (board: string) =>
		BoardInfoResultSchema.parse(JSON.parse(cli("board", "info", "--board", board)));
	const get = (board: string, id: string) =>
		GetResultSchema.parse(JSON.parse(cli("get", id, "--board", board)));
	const promote = (board: string, id: string, name: string, ...extra: string[]): void => {
		cli(
			"promote",
			"--board",
			board,
			"--ids",
			id,
			"--kind",
			"service",
			"--name",
			name,
			"--doing",
			"identifying the service",
			...extra,
		);
	};
	const link = (board: string, id: string, target: string): void => {
		cli(
			"update",
			id,
			"--board",
			board,
			"--set",
			JSON.stringify({ link: target }),
			"--doing",
			"linking to internals",
		);
	};
	const add = (board: string, label: string): string => {
		const file = join(ownerRoot, `${board}.json`);
		writeFileSync(
			file,
			JSON.stringify([
				{ type: "rectangle", x: 80, y: 80, width: 240, height: 100, label: { text: label } },
			]),
		);
		const result = AddResultSchema.parse(
			JSON.parse(cli("add", "--board", board, "--doing", "drawing the service", file)),
		);
		const id = result.elements.find((element) => element.type === "rectangle")?.id;
		expect(id).toBeDefined();
		return id!;
	};

	cli("board", "new", "payments", "--level", "system");
	cli("board", "new", "payments-internals", "--level", "service");
	const payments = add("payments", "Payments");
	promote("payments", payments, "Payments");
	link("payments", payments, "[[payments-internals]]");
	const api = add("payments-internals", "Payment API");
	promote("payments-internals", api, "Payment API");
	expect(info("payments").identity.level).toBe("system");
	expect(info("payments-internals").identity.level).toBe("service");
	expect(get("payments", payments)).toMatchObject({
		link: "[[payments-internals]]",
		customData: { archboard: { kind: "service", node: "payments" } },
	});
	expect(get("payments", payments)).not.toHaveProperty("customData.archboard.level");
	expect(get("payments-internals", api)).not.toHaveProperty("customData.archboard.level");
	promote("payments", payments, "Payments", "--level", "service");
	expect(get("payments", payments)).toMatchObject({
		link: "[[payments-internals]]",
		customData: { archboard: { level: "service" } },
	});
	expect(info("payments").identity.level).toBe("system");
	expect(cli("describe", "--board", "payments-internals")).toContain("Payment API");
	cli("check", "--board", "payments", "--strict");
	cli("check", "--board", "payments-internals", "--strict");
	cli("board", "new", "platform-migration", "--level", "system");
	// The reported target is intentionally absent until the person sees its failure.
	const reported = "platform-migration@strangler-foundation";
	link("payments-internals", api, `[[${reported}]]`);
	const note = (board: string): string =>
		readFileSync(join(vault, `${board}.excalidraw.md`), "utf8");
	const before = [note("payments"), note("payments-internals"), note("platform-migration")];

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await browser.run(["set", "viewport", "1920", "1080"]);
	const panes = () => request<PanesBody>("/api/panes").then((reply) => reply.body);
	await pollUntil(panes, (state) => state.paneCount === 1, "the first pane to register");
	cli("browser", "show", "platform-migration", "--pane", "primary");
	cli("browser", "open");
	cli("browser", "show", "payments", "--pane", "right");
	const initial = await panes();
	const right = initial.panes.find((pane) => pane.place === "right")!;
	const left = initial.panes.find((pane) => pane.place === "left")!;
	expect(left.board).toBe("platform-migration");
	const rightShows = async (key: string): Promise<void> => {
		const state = await pollUntil(
			panes,
			(value) => value.panes.find((pane) => pane.clientId === right.clientId)?.board === key,
			`the clicked pane to show ${key}`,
		);
		expect(state.panes.find((pane) => pane.clientId === left.clientId)?.board).toBe(
			"platform-migration",
		);
	};
	await activateLink(browser, payments, "[[payments-internals]]");
	await rightShows("payments-internals");
	await elementPoint(browser, api);
	await activateLink(browser, api, `[[${reported}]]`);
	await pollUntil(
		() => shellNotices(browser),
		(notices) =>
			notices.some(
				(notice) =>
					notice.title === "Open linked board" &&
					notice.description.includes(reported) &&
					notice.description.includes("try the link again"),
			),
		"a missing linked board to explain recovery",
	);
	await rightShows("payments-internals");
	expect(await browser.run(["get", "url"])).toContain(canvas.base);
	await dismissNotice(browser, "Open linked board");
	cli(
		"board",
		"save",
		"--board",
		"platform-migration",
		"--variant",
		"strangler-foundation",
		"--level",
		"service",
		"--doing",
		"branching the foundation proposal",
	);
	expect(info(reported).identity.level).toBe("service");
	const variantBefore = note(reported);
	await activateLink(browser, api, `[[${reported}]]`);
	await rightShows(reported);
	await clickNavigatorRow(browser, "payments");
	await rightShows("payments");
	await elementPoint(browser, payments);
	expect([note("payments"), note("payments-internals"), note("platform-migration")]).toEqual(
		before,
	);
	expect(note(reported)).toBe(variantBefore);
	link("payments", payments, "[[payments-internals|Internals]]");
	await activateLink(browser, payments, "[[payments-internals|Internals]]");
	await pollUntil(
		() => shellNotices(browser),
		(notices) => notices.some((notice) => notice.description.includes("without an alias")),
		"an unsupported Obsidian alias to name the supported board-link syntax",
	);
	await rightShows("payments");
	await canvas.assertRunning();
}, 20_000);
