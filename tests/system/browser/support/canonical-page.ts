import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import type { z } from "zod";
import type {
	ArchitectureModelRead,
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResult,
	ArchitectureClaimResult,
} from "@archboard/board/model";
import type { createJsonRequester } from "../../support/http.ts";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintId } from "@archboard/board/ids";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import type { Model, VariantContent } from "@archboard/board/content";
import { readArchitectureModel } from "@archboard/board/store-read";

type Node = Pick<
	Model["modules"][number],
	"name" | "kind" | "responsibility" | "parent" | "binding"
>;
type Edge = Pick<Model["relationships"][number], "from" | "to" | "kind" | "label">;
type Narrative = VariantContent["walkthroughs"][number];
interface Scene {
	readonly nodes: readonly Node[];
	readonly edges?: readonly Edge[];
	readonly walkthroughs?: readonly (Pick<Narrative, "name"> & {
		readonly beats: readonly Pick<Narrative["beats"][number], "heading" | "body">[];
	})[];
}

const SMALL_PIPELINE: Scene = {
	nodes: [
		{ name: "Ingest", kind: "service", responsibility: "Takes the feed" },
		{ name: "Warehouse", kind: "datastore", responsibility: "Keeps the rows" },
	],
	edges: [{ from: "Ingest", to: "Warehouse", kind: "data", label: "rows" }],
};

/** The authored reading used by the generic local voice workflow. */
const VOICE_PIPELINE: Scene = {
	nodes: [
		{ name: "Ingest", kind: "service" },
		{ name: "Warehouse", kind: "datastore" },
	],
	edges: [{ from: "Ingest", to: "Warehouse", kind: "data" }],
	walkthroughs: [
		{
			name: "Where rows go",
			beats: [
				{ heading: "All of it", body: "Two parts, one direction." },
				{ heading: "The warehouse", body: "Where the rows land." },
			],
		},
	],
};

/** Arrange authored files for a visible workflow, then read them through the public model interface. */
async function seedCanonicalModel(vault: string, name: string, scene: Scene = SMALL_PIPELINE) {
	if (existsSync(join(vault, "model.json")))
		throw new Error("This fixture already contains a canonical model.");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	const id = mintId();
	const ids = new Map(scene.nodes.map((node) => [node.name, `${id}#${mintId()}`]));
	const subject = (label: string): string => {
		const found = ids.get(label);
		if (found === undefined) throw new Error(`The fixture names an unavailable module: ${label}`);
		return found;
	};
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({ schemaVersion: 1, id, name, current: { id: "Current", name: "Implemented" } }),
	);
	scene.nodes.forEach(({ parent, ...node }, index) => {
		const outgoing = (scene.edges ?? [])
			.filter((edge) => edge.from === node.name)
			.map(({ to, kind, label }, order) => ({
				kind,
				label,
				id: `${id}#${mintId()}`,
				to: subject(to),
				order,
				emphasis: "normal",
			}));
		writeFileSync(
			join(vault, `module-${index}.module.json`),
			JSON.stringify({
				...node,
				schemaVersion: 1,
				id: subject(node.name),
				order: index,
				...(parent === undefined ? {} : { parent: subject(parent) }),
				outgoing,
			}),
		);
	});
	for (const [index, narrative] of (scene.walkthroughs ?? []).entries()) {
		writeFileSync(
			join(vault, `tour-${index}.walkthrough.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `${id}#${mintId()}`,
				name: narrative.name,
				target: { state: "current" },
				beats: narrative.beats.map((beat) => ({
					id: `${id}#${mintId()}`,
					title: beat.heading,
					narrative: beat.body,
					reading: { grammar: "architecture", selection: [] },
				})),
			}),
		);
	}
	const model = await readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}

const MODEL_STAGE = '[data-slot="architecture-model-stage"]';

/** Address the canonical model in the first pane without invoking a legacy board route. */
function modelAddress(base: string, model: Model): string {
	return `${base}/?modelA=${model.manifest.id}`;
}

/** Wait on the visible drawing rather than on the metadata read alone. */
async function modelDrawn(evaluate: <T>(expression: string) => Promise<T>): Promise<boolean> {
	return evaluate<boolean>(
		`document.querySelector('${MODEL_STAGE} [data-slot="model-diagram"] svg') !== null`,
	);
}

type StructuralEdit = Extract<z.input<typeof ArchitectureModuleEditSchema>, { changes: unknown }>;
type Changes = StructuralEdit["changes"];
/**
 * Apply a claimed structural edit through the shared public HTTP interface.
 * @param request The fixture server request client.
 * @param vault The explicit fixture vault.
 * @param operationId The retry identity.
 * @param changes The intended module and relationship changes.
 * @param intent Optional proposal intent and its doing line.
 * @returns The durable write receipt.
 */
async function editCanonicalModel(
	request: ReturnType<typeof createJsonRequester>,
	vault: string,
	operationId: string,
	changes: Changes,
	intent: Partial<Pick<Extract<StructuralEdit, { proposal: unknown }>, "proposal" | "doing">> = {},
) {
	const current = await request<ArchitectureModelRead>("/api/architecture/model");
	if (!current.body.success || current.body.manifest.current === null)
		throw new Error(JSON.stringify(current.body));
	const target = { model: current.body.manifest.id, state: current.body.manifest.current.id };
	const claimed = await request<ArchitectureClaimResult>("/api/architecture/claims", {
		method: "POST",
		body: {
			vault,
			target,
			writer: "fixture-agent",
			reason: "Explain module boundaries",
			subjects: [
				target.model,
				...current.body.proposals.map((proposal) => proposal.id),
				...current.body.modules.map((module) => module.id),
				...current.body.relationships.map((edge) => edge.id),
			],
		},
	});
	if (!claimed.body.success) throw new Error(JSON.stringify(claimed.body));
	const edited = await request<ArchitectureModuleEditResult>("/api/architecture/module", {
		method: "POST",
		body: {
			vault,
			target,
			expectedRevision: current.body.revision,
			operationId,
			writer: "fixture-agent",
			...intent,
			doing: intent.doing ?? "Changing module structure",
			claim: claimed.body.claim.id,
			changes,
		},
	});
	await request("/api/architecture/claims/release", {
		method: "POST",
		body: { vault, claim: claimed.body.claim.id, writer: "fixture-agent" },
	});
	if (!edited.body.success) throw new Error(JSON.stringify(edited.body));
	return edited.body;
}

/**
 * Wait until a module's reading is on screen. The sidebar reads the accepted scene,
 * so a read after a move waits for its picture.
 */
async function settledOn(browser: AgentBrowserSession, id: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') === ${JSON.stringify(id)} && document.querySelector('[data-slot="model-diagram"]')?.getAttribute('aria-busy') === 'false'`,
			),
		Boolean,
		"the selected scope",
		{ timeoutMs: 10_000 },
	);
}

/**
 * Pick a subject of the picture, as a click on it does. The panel opens after its wait.
 * @param browser The page.
 * @param id The subject.
 * @param options How to pick it.
 * @param options.toggle Whether the pick adds to the selection or takes from it.
 * @param options.scope A selector for the pane.
 */
async function pick(
	browser: AgentBrowserSession,
	id: string,
	options: { readonly toggle?: boolean; readonly scope?: string } = {},
): Promise<void> {
	const subject = `${options.scope ?? ""} [data-slot="model-diagram"] [data-semantic-id="${id}"]`;
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const subject = document.querySelector(${JSON.stringify(subject)});
				subject?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${options.toggle === true} }));
				return subject !== null;
			})()`),
		Boolean,
		`the picture of ${id}`,
		{ timeoutMs: 10_000 },
	);
}

/** Open a part of the picture from the panel, and wait for its picture. */
async function openModule(browser: AgentBrowserSession, id: string): Promise<void> {
	await openDiagram(browser);
	await pick(browser, id);
	const open = '[data-slot="model-panel"] [data-slot="module-open"]';
	// The panel is still sliding in, so a click at a place on the screen can miss it.
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const action = document.querySelector(${JSON.stringify(open)});
				action?.click();
				return action !== null;
			})()`),
		Boolean,
		"the module opening action",
		{ timeoutMs: 10_000 },
	);
	await settledOn(browser, id);
}

export {
	openModule,
	pick,
	settledOn,
	editCanonicalModel,
	seedCanonicalModel,
	modelAddress,
	modelDrawn,
	MODEL_STAGE,
	SMALL_PIPELINE,
	VOICE_PIPELINE,
};

/** Show a page of the reading through the header. */
async function openPage(
	browser: AgentBrowserSession,
	page: "diagram" | "about",
	pane = "",
): Promise<void> {
	const choice = `${pane} [data-slot="model-page"] [data-choice="${page}"]`;
	await pollUntil(
		async () => {
			const about = `document.querySelector(${JSON.stringify(`${pane} [data-slot="model-about"]`)}) !== null`;
			if ((await browser.eval<boolean>(about)) === (page === "about")) return true;
			await browser.eval(`document.querySelector(${JSON.stringify(choice)})?.click()`);
			return false;
		},
		Boolean,
		`the ${page} page`,
	);
}

/** Show the picture of the reading. */
async function openDiagram(browser: AgentBrowserSession, pane = ""): Promise<void> {
	await openPage(browser, "diagram", pane);
}

/** Open About on the scope or on the selection, which hold the long lists of a reading. */
async function openAbout(
	browser: AgentBrowserSession,
	subject: "scope" | "selection" = "scope",
	pane = "",
): Promise<void> {
	await openPage(browser, "about", pane);
	const about = `${pane} [data-slot="model-about"]`;
	const other = `${pane} [data-slot="model-about-other"]`;
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				if (document.querySelector(${JSON.stringify(about)})?.getAttribute('data-subject') === ${JSON.stringify(subject)}) return true;
				document.querySelector(${JSON.stringify(other)})?.click();
				return false;
			})()`),
		Boolean,
		`About on the ${subject}`,
	);
}

export { openAbout, openDiagram };

/**
 * Read again as a person does who comes back to the page. A healthy reading has no Refresh,
 * because the feed is live, and history that changes under it has no feed.
 */
async function refreshModel(browser: AgentBrowserSession): Promise<void> {
	await browser.eval(`window.dispatchEvent(new Event('visibilitychange'))`);
}

export { refreshModel };

/** Open a destination of the left column, which speaks for the focused pane. */
async function openDestination(browser: AgentBrowserSession, destination: string): Promise<void> {
	const tab = `[data-destination="${destination}"]`;
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${tab}') !== null`),
		Boolean,
		`the ${destination} destination`,
	);
	await browser.run(["click", tab]);
}

export { openDestination };

/** Bring a row of a list on screen, opening the row that holds the rest while it hides there. */
async function listedRow(browser: AgentBrowserSession, row: string): Promise<void> {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector(${JSON.stringify(row)}) !== null || void document.querySelector('[data-row-id="rest"][aria-expanded="false"]')?.click()`,
			),
		Boolean,
		`the row ${row}`,
	);
}

/** Find something by a text and choose it, which is how a bookmark or a former address opens. */
async function chooseFound(browser: AgentBrowserSession, text: string, id: string): Promise<void> {
	await browser.run(["fill", '[data-slot="model-find"] input', text]);
	const row = `[data-find-id=${JSON.stringify(id)}]`;
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector(${JSON.stringify(row)}) !== null`),
		Boolean,
		`the found row ${id}`,
	);
	await browser.run(["click", row]);
}

export { chooseFound };

/** Choose a flow, which draws its sequence. */
async function chooseFlow(browser: AgentBrowserSession, id: string): Promise<void> {
	await openDestination(browser, "flows");
	const row = `[data-flow-id=${JSON.stringify(id)}]`;
	await listedRow(browser, row);
	await browser.run(["click", row]);
}

export { chooseFlow };

/** Start an authored narrative from the Walkthroughs destination. */
async function startModelWalkthrough(browser: AgentBrowserSession, id: string): Promise<void> {
	await openDestination(browser, "walkthroughs");
	const row = `[data-walkthrough-id=${JSON.stringify(id)}]`;
	await listedRow(browser, row);
	await browser.run(["click", row]);
}

export { startModelWalkthrough };

/** Open a repository from the switcher, which lists every repository of the machine. */
async function openRepository(browser: AgentBrowserSession, repository: string): Promise<void> {
	const row = `[data-row-id=${JSON.stringify(`repository:${repository}`)}]`;
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(document.querySelector('[data-slot="repository-switcher"][aria-expanded="false"]')?.click(), document.querySelector(${JSON.stringify(row)})?.checkVisibility() === true)`,
			),
		Boolean,
		`the repository ${repository}`,
	);
	await browser.run(["click", row]);
}

export { openRepository };
