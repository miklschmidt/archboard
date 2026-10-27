// A synthetic checkout, made afresh for each evidence take. Its TypeScript and Git commits
// are real inputs to the CLI; neither the board nor the analysis answers are canned.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ArchitectureModuleEdit } from "@archboard/board/model";

import {
	inOrder,
	run,
	scratch,
	type TakeServer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { editModel, readModel } from "./model-authoring.ts";

type Change = Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"][number];
type ModuleInput = Extract<Change, { type: "add-module" }>["module"];
type RelationshipInput = Extract<Change, { type: "add-relationship" }>;

const MODEL = "Checkout and orders";
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
	await git(["config", "user.name", GIT_ENV.GIT_AUTHOR_NAME]);
	await git(["config", "user.email", GIT_ENV.GIT_AUTHOR_EMAIL]);
	await git(["config", "commit.gpgSign", "false"]);
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
 * Prepare a source repository and empty vault before its isolated server starts.
 * @param name The take directory under scratch/takes.
 * @returns The synthetic repository path.
 */
async function prepareEvidenceSource(name: string): Promise<string> {
	if (!/^[a-z0-9-]+$/u.test(name))
		throw new Error("An evidence take needs a simple directory name");
	const root = scratch("takes", name, "source");
	await prepareSource(root);
	mkdirSync(join(root, ".archboard", "vault"), { recursive: true });
	return root;
}

/**
 * Author the synthetic architecture through canonical CLI operations.
 * @param server The server over this take's source repository.
 * @param name The take directory under scratch/takes.
 * @returns Saved model and module identities, proposals, and the source range.
 */
async function prepareEvidenceFixture(server: TakeServer, name: string) {
	const sourceRoot = scratch("takes", name, "source");
	await server.cli([
		"model",
		"init",
		"--name",
		MODEL,
		"--operation-id",
		"initialize-evidence",
		"--writer",
		"readme",
		"--doing",
		"Initialize the synthetic architecture",
	]);
	const part = (
		partName: string,
		path: string,
		responsibility: string,
		parent?: string,
	): ModuleInput => ({
		name: partName,
		order: 0,
		kind: parent === undefined ? "module" : "function",
		responsibility,
		binding: { repo: REPO, path },
		...(parent === undefined ? {} : { parent }),
	});
	const call = (source: string, to: string, path: string, symbol: string): RelationshipInput => ({
		type: "add-relationship",
		source,
		relationship: {
			order: 0,
			to,
			kind: "call",
			label: `${symbol}()`,
			emphasis: "normal",
			anchor: { repo: REPO, path, symbol },
		},
	});
	const modules = [
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
	];
	const initial = await editModel(
		server,
		name,
		null,
		[
			...modules.map((module, order): Change => ({
				type: "add-module",
				module: { ...module, order },
			})),
			call("Checkout route", "Place order", "src/checkout/route.ts", "placeOrder"),
			call("Replay job", "Place order", "src/replay/job.ts", "placeOrder"),
			call("Place order", "Validate order", "src/orders/place-order.ts", "validateOrder"),
			// The code check must discover the deliberately omitted placeOrder -> saveOrder call.
		],
		{ type: "create", name: "Implemented checkout" },
	);
	await editModel(server, name, initial.target.state, [], {
		type: "adopt",
		reason: "The synthetic source implements this architecture.",
	});
	await inOrder(Object.values(PROPOSALS), async (proposal) => {
		const changes: Change[] = [
			call("Place order", "Save order", "src/orders/place-order.ts", "saveOrder"),
		];
		if (proposal === PROPOSALS.narrow)
			changes.push({
				type: "edit-module",
				subject: "Replay job",
				set: { responsibility: "Replays accepted orders through the single Orders entry point" },
			});
		else
			changes.push(
				{
					type: "add-relationship",
					source: "Checkout route",
					relationship: {
						order: 0,
						to: "Validate order",
						kind: "call",
						emphasis: "normal",
						label: "validateOrder()",
						description: "Proposal: checkout directly calls the validation entry point.",
					},
				},
				{
					type: "add-relationship",
					source: "Replay job",
					relationship: {
						order: 0,
						to: "Save order",
						kind: "call",
						emphasis: "normal",
						label: "saveOrder()",
						description: "Proposal: replay directly calls the storage entry point.",
					},
				},
			);
		await editModel(server, name, null, changes, { type: "create", name: proposal });
	});
	const model = await readModel(server);
	const node = (partName: string): string => {
		const found = model.modules.find((saved) => saved.name === partName);
		if (found === undefined) throw new Error(`The evidence fixture has no ${partName}`);
		return found.id;
	};
	return {
		model: model.manifest.id,
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

export { prepareEvidenceFixture, prepareEvidenceSource };
