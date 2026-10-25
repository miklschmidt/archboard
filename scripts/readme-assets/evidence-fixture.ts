// A synthetic checkout, made afresh for each evidence take. Its TypeScript and Git commits
// are real inputs to the CLI; neither the board nor the analysis answers are canned.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { currentVariant } from "@archboard/board/document";
import type {
	SemanticEdgeInput,
	SemanticNodeInput,
} from "@archboard/board/commands";

import {
	inOrder,
	readBoard,
	run,
	scratch,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
import type { BoardCreateInputSchema } from "@archboard/board/commands";
import type { z } from "zod";
import type { VariantEditInputSchema } from "@archboard/board/commands";

type VariantEditInput = z.infer<typeof VariantEditInputSchema>;
type BoardCreateInput = z.infer<typeof BoardCreateInputSchema>;

const BOARD = "Checkout and orders";
const REPO = "example.invalid/archboard/readme-checkout";
const PROPOSALS = { narrow: "One entry point", wide: "Entry per job" } as const;
const BASE = "main";

/** The sample's complete source, before its history adds comments. */
const SOURCE = {
	"README.md":
		"# Synthetic checkout example\n\nMade only for the Archboard README demonstrations.\n",
	"tsconfig.json": JSON.stringify({
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "Bundler",
			strict: true,
		},
		include: ["src/**/*.ts"],
	}),
	"src/orders/index.ts": 'export { placeOrder } from "./place-order";\n',
	"src/orders/place-order.ts": [
		'import { validateOrder } from "./lib/validate-order";',
		'import { saveOrder } from "./lib/save-order";',
		"",
		"export function placeOrder(total: number): string {",
		"  validateOrder(total);",
		"  return saveOrder(total);",
		"}",
		"",
	].join("\n"),
	"src/orders/lib/validate-order.ts": [
		"export function validateOrder(total: number): void {",
		'  if (total <= 0) throw new Error("The order total must be positive");',
		"}",
		"",
	].join("\n"),
	"src/orders/lib/save-order.ts": [
		"export function saveOrder(total: number): string {",
		"  return `order:${total}`;",
		"}",
		"",
	].join("\n"),
	"src/checkout/route.ts": [
		'import { placeOrder } from "../orders";',
		"export function checkout(total: number): string { return placeOrder(total); }",
		"",
	].join("\n"),
	"src/replay/job.ts": [
		'import { placeOrder } from "../orders";',
		"export function replay(total: number): string { return placeOrder(total); }",
		"",
	].join("\n"),
} as const;

/** The two paths repeatedly changed together, with no relationship between their parts. */
const COUPLED = ["src/orders/lib/validate-order.ts", "src/orders/lib/save-order.ts"] as const;
const HISTORY = [
	"Align validation and storage on the order total",
	"Keep validation and storage on the same rounding rule",
	"Document the shared order currency convention",
	"Align the accepted and stored order amount",
	"Clarify the shared total format",
	"Keep validation and storage contracts together",
] as const;

/** Fixed example authors and dates keep the source repository reproducible. */
const GIT_ENV = {
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "Archboard Example",
	GIT_AUTHOR_EMAIL: "example@archboard.invalid",
	GIT_COMMITTER_NAME: "Archboard Example",
	GIT_COMMITTER_EMAIL: "example@archboard.invalid",
} as const;

/**
 * Create the isolated source repository and its deterministic history.
 * @param root The take's source directory, never a real checkout.
 */
async function prepareSource(root: string): Promise<void> {
	rmSync(root, { recursive: true, force: true });
	for (const [path, content] of Object.entries(SOURCE)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
	/**
	 * Run Git only in this synthetic checkout, without user hooks or signing.
	 * @param args Git's arguments.
	 * @param day The deterministic commit day, when this command commits.
	 * @returns The command's output.
	 */
	const git = (args: readonly string[], day = 1) => {
		const env = {
			...GIT_ENV,
			GIT_AUTHOR_DATE: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
			GIT_COMMITTER_DATE: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`,
		};
		// Git hooks export repository paths and config. Do not let those redirect fixture writes.
		const inherited = Object.keys(process.env).flatMap((key) =>
			key.startsWith("GIT_") && !Object.hasOwn(env, key) ? ["-u", key] : [],
		);
		return run(
			[
				"env",
				...inherited,
				"git",
				"-c",
				"core.hooksPath=/dev/null",
				"-c",
				"commit.gpgSign=false",
				...args,
			],
			{ cwd: root, env },
		);
	};
	await git(["init", "-q", "-b", BASE]);
	await git(["remote", "add", "origin", `https://${REPO}.git`]);
	await git(["add", "--all"]);
	await git(["commit", "-q", "-m", "Create the synthetic checkout example"]);
	await inOrder(HISTORY, async (subject, index) => {
		for (const path of COUPLED) {
			writeFileSync(join(root, path), `// Example contract revision ${index + 1}: ${subject}.\n`, {
				flag: "a",
			});
		}
		await git(["add", "--", ...COUPLED]);
		await git(["commit", "-q", "-m", subject], index + 2);
	});
	await git(["switch", "-q", "-c", "checkout-proposal"]);
	await inOrder(
		[
			{ path: COUPLED[1], subject: "Apply the proposal's order storage contract" },
			{ path: COUPLED[0], subject: "Clarify validation outside the proposal" },
		],
		async ({ path, subject }, index) => {
			writeFileSync(join(root, path), `// Example branch change: ${subject}.\n`, { flag: "a" });
			await git(["add", "--", path]);
			await git(["commit", "-q", "-m", subject], index + 8);
		},
	);
}

/**
 * Prepare the shared example for the three README evidence demonstrations.
 * @param server A take server over an isolated copy of examples/web-shop and isolated state.
 * @param name The scene's single directory name under scratch/takes.
 * @returns Board names, CLI-minted node ids, and the source range used by the history scene.
 * @throws {Error} When the name could leave the take directory or the CLI omitted a part.
 */
async function prepareEvidenceFixture(server: TakeServer, name: string) {
	if (!/^[a-z0-9-]+$/u.test(name))
		throw new Error("An evidence take needs a simple directory name");
	const home = scratch("takes", name);
	const sourceRoot = join(home, "source");
	await prepareSource(sourceRoot);
	await server.cli(["repo", "add", sourceRoot]);
	/**
	 * One sample part, bound to the file that implements it.
	 * @param partName The part's display name.
	 * @param path Its source file or directory.
	 * @param responsibility What it does.
	 * @param parent The module that contains it, when any.
	 * @returns CLI input that carries no invented subject id.
	 */
	const part = (
		partName: string,
		path: string,
		responsibility: string,
		parent?: string,
	): SemanticNodeInput => ({
		name: partName,
		kind: parent === undefined ? "module" : "function",
		responsibility,
		binding: { repo: REPO, path },
		...(parent === undefined ? {} : { parent }),
	});
	/**
	 * A drawn or proposed call, with its source anchor.
	 * @param from Its calling part.
	 * @param to Its called part.
	 * @param path The source file containing the call.
	 * @param symbol The called function.
	 * @returns The relationship input.
	 */
	const call = (from: string, to: string, path: string, symbol: string): SemanticEdgeInput => ({
		from,
		to,
		kind: "call",
		label: `${symbol}()`,
		anchor: { repo: REPO, path, symbol },
	});
	const input: BoardCreateInput = {
		name: BOARD,
		level: "module",
		summary: "Synthetic sample: checkout callers, the Orders interface, and its hidden work.",
		nodes: [
			part(
				"Checkout route",
				"src/checkout/route.ts",
				"Accepts a checkout request and places its order",
			),
			part("Replay job", "src/replay/job.ts", "Replays an accepted checkout request"),
			part("Orders", "src/orders", "Owns order validation and storage behind its entry point"),
			part(
				"Place order",
				"src/orders/place-order.ts",
				"Validates the total and saves the order",
				"Orders",
			),
			part("Validate order", COUPLED[0], "Checks that the order total is positive", "Orders"),
			part("Save order", COUPLED[1], "Stores an order with the accepted total", "Orders"),
		],
		edges: [
			call("Checkout route", "Place order", "src/checkout/route.ts", "placeOrder"),
			call("Replay job", "Place order", "src/replay/job.ts", "placeOrder"),
			call("Place order", "Validate order", "src/orders/place-order.ts", "validateOrder"),
			// Deliberately omit placeOrder -> saveOrder: the code check must discover it.
		],
		flows: [],
		views: [],
		walkthroughs: [],
	};
	const newInput = join(home, "evidence-new.json");
	writeFileSync(newInput, JSON.stringify(input));
	await server.cli([
		"semantic",
		"new",
		BOARD,
		"--input",
		newInput,
		"--doing",
		"drawing the synthetic checkout example",
	]);
	await server.cli([
		"claim",
		"--board",
		BOARD,
		"--reason",
		"Preparing the README's synthetic evidence examples",
	]);
	try {
		await inOrder(Object.values(PROPOSALS), async (proposal) => {
			const board = await readBoard(server, BOARD);
			await server.cli([
				"semantic",
				"branch",
				BOARD,
				"--as",
				proposal,
				"--expect-version",
				String(board.version),
				"--doing",
				`drafting ${proposal}`,
			]);
			const after = await readBoard(server, BOARD);
			const edit: Pick<VariantEditInput, "nodes" | "edges"> = {
				nodes:
					proposal === PROPOSALS.narrow
						? [
								part(
									"Replay job",
									"src/replay/job.ts",
									"Replays accepted orders through the single Orders entry point",
								),
							]
						: [],
				edges: [
					call("Place order", "Save order", "src/orders/place-order.ts", "saveOrder"),
					...(proposal === PROPOSALS.wide
						? [
								{
									from: "Checkout route",
									to: "Validate order",
									kind: "call",
									label: "validateOrder()",
									description: "Proposal: checkout directly calls the validation entry point.",
								},
								{
									from: "Replay job",
									to: "Save order",
									kind: "call",
									label: "saveOrder()",
									description: "Proposal: replay directly calls the storage entry point.",
								},
							]
						: []),
				],
			};
			const editInput = join(
				home,
				`evidence-${proposal === PROPOSALS.narrow ? "narrow" : "wide"}.json`,
			);
			writeFileSync(editInput, JSON.stringify(edit));
			await server.cli([
				"semantic",
				"edit",
				BOARD,
				"--variant",
				proposal,
				"--expect-version",
				String(after.version),
				"--input",
				editInput,
				"--doing",
				`showing the ${proposal} interface`,
			]);
		});
	} finally {
		await server.cli(["release", "--board", BOARD]);
	}
	const board = await readBoard(server, BOARD);
	const current = currentVariant(board);
	/**
	 * Read the id the CLI minted for a known sample part.
	 * @param partName The part's name.
	 * @returns Its saved id.
	 * @throws {Error} When the CLI did not save the part.
	 */
	const node = (partName: string): string => {
		const found = current?.content.nodes.find((saved) => saved.name === partName);
		if (found === undefined) throw new Error(`The evidence fixture has no ${partName}`);
		return found.id;
	};
	return {
		board: BOARD,
		sourceRoot,
		repo: REPO,
		base: BASE,
		proposals: PROPOSALS,
		nodes: {
			orders: node("Orders"),
			place: node("Place order"),
			validate: node("Validate order"),
			save: node("Save order"),
			checkout: node("Checkout route"),
			replay: node("Replay job"),
		},
	} as const;
}

export { prepareEvidenceFixture };
