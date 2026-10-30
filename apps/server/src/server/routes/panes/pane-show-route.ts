import type { Request, Response } from "express";
import { z } from "zod";
import { ArchitecturePaneReadingSchema } from "@archboard/board/pane-context";
import { readArchitectureModel } from "@archboard/board/store-read";
import { projectModel } from "@archboard/board/content";
import { publishPaneContext } from "@archboard/workbench/server";
import {
	paneFromRequest,
	paneResponse,
	semanticPaneContextFor,
	sendToPane,
} from "@archboard/workbench/panes";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { messageOf, vaultOfRequest } from "@archboard/workbench/host";
import { logger } from "@archboard/diagnostics/logger";
import { arrivedOnBoard, noBrowserBody } from "#server/routes/panes/pane-routes.ts";
import { movePaneVault } from "#server/state/pane-vaults/pane-vaults.ts";
import { placeOfVault } from "@archboard/workspace/repository-listing";
import { followRegistry } from "#server/routes/repositories/repository-routes.ts";
import {
	chooseKnownCheckout,
	registeredRepositoryOfVault as registeredRepositoryOf,
} from "@archboard/workspace/checkouts";
import { respond } from "#server/routes/architecture/model-response.ts";
const RequestSchema = z.strictObject({
	vault: z.string().optional(),
	pane: z.string().optional(),
	agent: z.boolean().optional(),
	session: z.string().optional(),
	reading: ArchitecturePaneReadingSchema,
});
type Reading = z.infer<typeof ArchitecturePaneReadingSchema>;
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
		{ hideKinds: request.hideKinds, hideGroups: request.hideGroups },
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
 * Require the addressed model and authored flow before presentation resolution.
 * @param model The complete canonical reading.
 * @param request The requested model and grammar.
 * @returns Its refusal, when unavailable.
 */
function selectionRefusal(model: Model, request: Reading): NavigationError | undefined {
	if (
		request.model !== undefined &&
		![model.manifest.id, model.manifest.name].includes(request.model)
	)
		return { code: "TARGET_CHANGED", error: "The addressed vault contains another model." };
	if (request.grammar !== "architecture" && model.selectedFlow === undefined)
		return { code: "FLOW_REQUIRED", error: "Select an authored flow for this grammar." };
	return structuralRefusal(model, request) ?? narrativeRefusal(model, request);
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
		from: semanticPaneContextFor(clientId)?.board?.name ?? null,
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
	arrivedOnBoard(pane.clientId, `model:${model.manifest.id}`);
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
 * Resolve a canonical reading before pointing the existing pane at it.
 * @param req The explicit vault and reading.
 * @param res The navigation receipt or refusal.
 */
async function showPaneRoute(req: Request, res: Response): Promise<void> {
	const parsed = RequestSchema.safeParse(req.body);
	if (!parsed.success) {
		res
			.status(400)
			.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
		return;
	}
	const body = parsed.data,
		vault = vaultOfRequest(req);
	const {
		module,
		flow,
		scope: _scope,
		focus: _focus,
		hideKinds: _kinds,
		hideGroups: _groups,
		grammar: _grammar,
		beat: _beat,
		model: _asked,
		...selectors
	} = body.reading;
	const model = await readArchitectureModel(vault, module, flow, selectors);
	if (!model.success) {
		respond(res, model);
		return;
	}
	const refused = selectionRefusal(model, body.reading);
	if (refused !== undefined) {
		res.status(422).json({ success: false, ...refused });
		return;
	}
	const pane = showablePane(vault, body.pane, res);
	if (pane !== null) showResolvedPane(body, vault, model, pane, res);
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
 * @param vault The vault of the board shown, or moved into.
 * @param act What chose, as the log says it.
 * @returns The choice, or undefined when it changed no choice.
 */
function chooseShownCheckout(vault: string, act = "A show"): ShowChoice | undefined {
	const shown = registeredRepositoryOf(vault);
	if (shown === undefined || shown.chosen) {
		return undefined;
	}
	const chosen = chooseKnownCheckout(shown.root);
	if (chosen?.changed !== true) {
		return undefined;
	}
	logger.info(`${act} made ${shown.root} the chosen checkout of ${shown.name}`);
	return { repository: shown.name, checkout: shown.root, replaced: chosen.replaced };
}

/**
 * The pane a show is addressed to, or nothing once the refusal has been sent.
 * @param vault The vault the board is in: an unnamed pane must be one of that vault's.
 * @param spec The pane spec the caller stated, if any.
 * @param res The response.
 * @returns The pane, or null.
 */
function showablePane(vault: string, spec: unknown, res: Response): PaneRegistration | null {
	let pane: PaneRegistration | null;
	try {
		pane = paneFromRequest(vault, spec);
	} catch (error) {
		res.status(400).json({ success: false, error: messageOf(error) });
		return null;
	}
	if (pane === null) {
		res.status(503).json(noBrowserBody("Showing a board"));
	}
	return pane;
}

export { chooseShownCheckout, showPaneRoute, type ShowChoice };
