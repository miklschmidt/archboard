import type { Request, Response } from "express";
import { z } from "zod";
import { modelShape, type ModelDocument } from "@archboard/model-contract";
import { readArchitectureModel } from "@archboard/model-store";
import { projectModel } from "@archboard/model-rules";
import { logger } from "@archboard/diagnostics/logger";
import { placeOfVault } from "@archboard/workspace/vault";
import { chooseCheckout } from "@archboard/workspace/checkouts";
import type { PaneRegistration } from "#server/panes/rules/pane-layout.ts";
import { semanticPaneContextFor } from "#server/panes/services/context.ts";
import { movePaneVault } from "#server/panes/services/pane-vaults.ts";
import {
	arrivedOnModel,
	paneFromRequest,
	paneResponse,
	sendKeylessToPane,
	sendToPane,
} from "#server/panes/services/registry.ts";
import { messageOf } from "#server/request/services/request-fields.ts";
import { publishPaneContext } from "#server/workbench-host/services/wiring-hooks.ts";
import { noBrowserBody } from "#server/panes/routes/pane-routes.ts";
import { followRegistry } from "#server/panes/services/registry-follow.ts";
import type { WorkbenchHooks } from "#server/workbench-host/routes/workbench-routes.ts";

/** What a show needs of the server: the vault a request names, how it refuses a read, its URL. */
type ShowHooks = Pick<WorkbenchHooks, "refusalStatus" | "vaultOfRequest" | "address">;
const RequestSchema = z.strictObject({
	vault: z.string().optional(),
	pane: z.string().optional(),
	agent: z.boolean().optional(),
	session: z.string().optional(),
	reading: modelShape("paneReading"),
});
type Reading = ModelDocument<"paneReading">;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type NavigationError = { code: string; error: string };
/**
 * Refuse a missing scope or focus before pane navigation changes state.
 * @param model The complete canonical reading.
 * @param request The requested presentation.
 * @returns Its refusal, when unavailable.
 */
function structuralRefusal(model: Model, request: Reading): NavigationError | undefined {
	const projection = projectModel(
		model,
		request.scope ?? model.selectedModule ?? null,
		request.focus ?? null,
		{ hideKinds: request.hideKinds },
	);
	if (projection.missing || projection.missingFocus.length !== 0)
		return { code: "MODULE_NOT_FOUND", error: "The requested scope or focus is unavailable." };
	return undefined;
}
/**
 * Require a complete authored narrative and an existing beat.
 * @param model The complete canonical reading.
 * @param request The requested narrative.
 * @returns Its refusal, when unavailable.
 */
function narrativeRefusal(model: Model, request: Reading): NavigationError | undefined {
	if (request.walkthrough === undefined) return undefined;
	if (!model.playback)
		return { code: "WALKTHROUGH_NOT_FOUND", error: "The requested walkthrough is unavailable." };
	if (
		model.playback.beats.some((entry) => entry.status !== "ready") ||
		(request.beat ?? 0) >= model.playback.beats.length
	)
		return {
			code: "WALKTHROUGH_NOT_FOUND",
			error: "The complete walkthrough or requested beat is unavailable.",
		};
	return undefined;
}
/**
 * An agent hears at once that a scope is missing. A reader's own address goes through, because
 * the pane says what the reading lacks and offers the way on.
 * @param model The complete canonical reading.
 * @param request The requested presentation.
 * @param agent Whether an agent asked.
 * @returns Its refusal, when an agent asked for what is unavailable.
 */
function agentRefusal(model: Model, request: Reading, agent: boolean): NavigationError | undefined {
	return agent ? structuralRefusal(model, request) : undefined;
}
/**
 * Require the addressed model and authored flow before presentation resolution.
 * @param model The complete canonical reading.
 * @param request The requested model and grammar.
 * @param agent Whether an agent asked.
 * @returns Its refusal, when unavailable.
 */
function selectionRefusal(
	model: Model,
	request: Reading,
	agent: boolean,
): NavigationError | undefined {
	if (
		request.model !== undefined &&
		![model.manifest.id, model.manifest.name].includes(request.model)
	)
		return { code: "TARGET_CHANGED", error: "The addressed vault contains another model." };
	if (request.grammar !== "architecture" && model.selectedFlow === undefined)
		return { code: "FLOW_REQUIRED", error: "Select an authored flow for this grammar." };
	return agentRefusal(model, request, agent) ?? narrativeRefusal(model, request);
}
/**
 * Resolve stable reading selectors for the existing client renderer.
 * @param model The complete canonical reading.
 * @param request The requested selectors.
 * @returns The addressed reading.
 */
function addressedReading(model: Model, request: Reading): Reading {
	return {
		...request,
		model: model.manifest.id,
		module: model.selectedModule,
		scope: request.scope ?? model.selectedModule,
		flow: model.selectedFlow,
		...(model.playback === undefined
			? {}
			: { walkthrough: model.playback.walkthrough.id, beat: request.beat ?? 0 }),
	};
}
/**
 * Attribute explicit agent navigation through the existing pane event.
 * @param body The parsed navigation request.
 * @param clientId The pane that the agent addresses.
 * @returns The agent mark, or absence for browser navigation.
 */
function agentSwitch(body: z.infer<typeof RequestSchema>, clientId: string) {
	if (body.agent !== true) return undefined;
	return {
		from: semanticPaneContextFor(clientId)?.model?.name ?? null,
		by: body.session ?? null,
	};
}
/**
 * Complete an already resolved pane move through the existing routing owner.
 * @param body The parsed navigation request.
 * @param vault The addressed vault.
 * @param model The resolved architecture.
 * @param pane The selected pane.
 * @param res The navigation receipt.
 */
function showResolvedPane(
	body: z.infer<typeof RequestSchema>,
	vault: string,
	model: Model,
	pane: PaneRegistration,
	res: Response,
): void {
	const reading = addressedReading(model, body.reading);
	const moved = agentSwitch(body, pane.clientId);
	const chose = body.agent === true ? chooseShownCheckout(vault) : undefined;
	movePaneVault(pane.clientId, vault);
	const { repository, checkout } = placeOfVault(vault);
	sendToPane(
		pane.clientId,
		{
			type: "pane_model",
			model: model.manifest.id,
			reading,
			revision: model.revision,
			vault,
			repository,
		},
		`model:${model.manifest.id}`,
	);
	arrivedOnModel(pane.clientId, `model:${model.manifest.id}`);
	publishPaneContext(pane.clientId, "focus", [], moved);
	if (chose !== undefined) followRegistry();
	res.json({
		success: true,
		model: model.manifest.id,
		reading,
		revision: model.revision,
		repository,
		checkout,
		paneId: pane.paneId,
		...paneResponse(pane),
		...(chose === undefined ? {} : { chose }),
	});
}
/**
 * Whether a reader opens a repository that holds nothing to read yet. The pane goes there
 * anyway, because that pane states what the repository lacks and offers the way on.
 * @param model The refusal of the read.
 * @param body The parsed navigation request.
 * @returns True for a reader's plain open of a repository with no model or a legacy one.
 */
function opensUnread(
	model: Exclude<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>,
	body: z.infer<typeof RequestSchema>,
): boolean {
	const unread = model.code === "LEGACY_AUTHORITY" || model.code === "MODEL_NOT_FOUND";
	return unread && body.agent !== true && body.reading.model === undefined;
}
/**
 * Move a pane into a vault with no reading to send it.
 * @param vault The addressed vault.
 * @param pane The selected pane.
 * @param res The navigation receipt.
 */
function moveUnread(vault: string, pane: PaneRegistration, res: Response): void {
	movePaneVault(pane.clientId, vault);
	const { repository, checkout } = placeOfVault(vault);
	const place = { type: "pane_place", paneKey: null, identity: null, vault, repository } as const;
	sendKeylessToPane(pane.clientId, place);
	res.json({ success: true, repository, checkout, paneId: pane.paneId, ...paneResponse(pane) });
}
/**
 * Answer a read that failed: a reader's open still moves the pane, and anything else is refused.
 * @param model The refusal of the read.
 * @param body The parsed navigation request.
 * @param vault The addressed vault.
 * @param res The navigation receipt or refusal.
 * @param hooks How the server answers a refused read.
 */
function answerUnread(
	model: Parameters<typeof opensUnread>[0],
	body: z.infer<typeof RequestSchema>,
	vault: string,
	res: Response,
	hooks: ShowHooks,
): void {
	const pane = opensUnread(model, body)
		? showablePane(vault, body.pane, res, hooks.address.httpUrl)
		: undefined;
	if (pane === undefined)
		res.set("Cache-Control", "no-store").status(hooks.refusalStatus(model)).json(model);
	else if (pane !== null) moveUnread(vault, pane, res);
}
/**
 * Resolve a canonical reading before pointing the existing pane at it.
 * @param req The explicit vault and reading.
 * @param res The navigation receipt or refusal.
 * @param hooks How the server answers a refused read.
 */
async function showPane(req: Request, res: Response, hooks: ShowHooks): Promise<void> {
	const parsed = RequestSchema.safeParse(req.body);
	if (!parsed.success) {
		res
			.status(400)
			.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
		return;
	}
	const body = parsed.data,
		vault = hooks.vaultOfRequest(req);
	const {
		module,
		flow,
		scope: _scope,
		focus: _focus,
		hideKinds: _kinds,
		expand: _expand,
		grammar: _grammar,
		beat: _beat,
		model: _asked,
		...selectors
	} = body.reading;
	const model = await readArchitectureModel(vault, module, flow, selectors);
	if (!model.success) {
		answerUnread(model, body, vault, res, hooks);
		return;
	}
	const refused = selectionRefusal(model, body.reading, body.agent === true);
	if (refused !== undefined) {
		res.status(422).json({ success: false, ...refused });
		return;
	}
	const pane = showablePane(vault, body.pane, res, hooks.address.httpUrl);
	if (pane !== null) showResolvedPane(body, vault, model, pane, res);
}

/**
 * The route that points a pane at a canonical reading.
 * @param hooks How the server answers a refused read.
 * @returns The route.
 */
function showPaneRoute(hooks: ShowHooks): (req: Request, res: Response) => Promise<void> {
	return (req, res) => showPane(req, res, hooks);
}
/** A choice of checkout that a show or a move made, as its answer names it. */
interface ShowChoice {
	readonly repository: string;
	/** The checkout chosen now. */
	readonly checkout: string;
	/** The checkout that was chosen before, or null when the repository had none chosen. */
	readonly replaced: string | null;
}

/**
 * Make the checkout of a shown vault the chosen one of its repository, when it
 * is a known checkout that is not chosen. An untracked vault is always read, and
 * a vault no registered directory holds has no repository to choose for. A move
 * into a checkout chooses it the same way (ADR 0051).
 * @param vault The vault of the model shown, or moved into.
 * @param act What chose, as the log says it.
 * @returns The choice, or undefined when it changed no choice.
 */
function chooseShownCheckout(vault: string, act = "A show"): ShowChoice | undefined {
	const { repository, checkout, chosen } = placeOfVault(vault);
	if (repository === null || chosen) {
		return undefined;
	}
	const choice = chooseCheckout(repository, checkout);
	if (choice.kind !== "chosen" || !choice.changed) {
		return undefined;
	}
	logger().info(`${act} made ${checkout} the chosen checkout of ${repository}`);
	return { repository, checkout, replaced: choice.replaced };
}

/**
 * The pane a show is addressed to, or nothing once the refusal has been sent.
 * @param vault The vault the model is in: an unnamed pane must be one of that vault's.
 * @param spec The pane spec the caller stated, if any.
 * @param res The response.
 * @param httpUrl Where this server is reached, which a refusal for want of a browser names.
 * @returns The pane, or null.
 */
function showablePane(
	vault: string,
	spec: unknown,
	res: Response,
	httpUrl: string,
): PaneRegistration | null {
	let pane: PaneRegistration | null;
	try {
		pane = paneFromRequest(vault, spec);
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
		return null;
	}
	if (pane === null) {
		res.status(503).json(noBrowserBody("Showing a model", httpUrl));
	}
	return pane;
}

export { showPaneRoute };
