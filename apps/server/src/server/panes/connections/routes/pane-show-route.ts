import type { Request, Response } from "express";
import { z } from "zod";
import { architecturePaneReadingSchema } from "@archboard/model/pane-context";
import { readArchitectureModel } from "@archboard/model/store-read";
import { projectModel } from "@archboard/model/content";
import { publishPaneContext } from "@archboard/workbench/server";
import {
	arrivedOnModel,
	movePaneVault,
	onScreenPanes,
	paneFromRequest,
	paneResponse,
	primaryPane,
	semanticPaneContextFor,
	sendKeylessToPane,
	sendToPane,
} from "@archboard/workbench/panes";
import { resolvePane, type PaneRegistration } from "@archboard/server-lifecycle/panes";
import { bodyOf, messageOf, namedVault, queryString } from "@archboard/workbench/host";
import { logger } from "@archboard/diagnostics/logger";
import { noBrowserBody } from "#server/panes/connections/routes/pane-routes.ts";
import { placeOfVault } from "@archboard/workspace/repository-listing";
import { followRegistry } from "#server/http/handlers/repositories/routes/repository-routes.ts";
import {
	chooseKnownCheckout,
	registeredRepositoryOfVault as registeredRepositoryOf,
} from "@archboard/workspace/checkouts";
import { respond } from "#server/http/handlers/routes/model-response.ts";
import {
	extractDisplaySettings,
	isSettingsOnlyRequest,
	mergeKeptReading,
	resolvePaneReading,
	type NavigationError,
} from "#server/panes/connections/rules/pane-reading.ts";

const RequestSchema = z.strictObject({
	vault: z.string().optional(),
	pane: z.string().optional(),
	agent: z.boolean().optional(),
	session: z.string().optional(),
	reading: architecturePaneReadingSchema(),
});
type Reading = z.infer<ReturnType<typeof architecturePaneReadingSchema>>;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;

/**
 * Refuse a lens the reading does not have before pane navigation changes state.
 * @param model The complete canonical reading.
 * @param lens The requested lens, if any.
 * @returns Its refusal, when unavailable.
 */
function lensRefusal(model: Model, lens: string | undefined): NavigationError | undefined {
	if (lens === undefined || Object.hasOwn(model.policy.lenses, lens)) return undefined;
	return {
		code: "LENS_NOT_FOUND",
		error: `This reading has no lens "${lens}". Its lenses: ${Object.keys(model.policy.lenses).join(", ")}.`,
	};
}

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
		{ hideKinds: request.hideKinds, hideEffects: request.hideEffects },
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
 * An agent hears at once that a lens or a scope is missing. A reader's own address goes through, because
 * the pane says what the reading lacks and offers the way on.
 * @param model The complete canonical reading.
 * @param request The requested presentation.
 * @param agent Whether an agent asked.
 * @returns Its refusal, when an agent asked for what is unavailable.
 */
function agentRefusal(model: Model, request: Reading, agent: boolean): NavigationError | undefined {
	return agent
		? (lensRefusal(model, request.lens) ?? structuralRefusal(model, request))
		: undefined;
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
	const grammar = request.grammar ?? "architecture";
	if (
		grammar !== "architecture" &&
		model.selectedFlow === undefined &&
		request.resolvedEphemeralFlow === undefined
	)
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
		grammar: request.grammar ?? "architecture",
		model: model.manifest.id,
		module: model.selectedModule,
		scope: request.scope ?? model.selectedModule,
		flow: request.resolvedEphemeralFlow === undefined ? model.selectedFlow : undefined,
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
 * @param resolved The resolved canonical reading.
 * @param vault The addressed vault.
 * @param model The resolved architecture.
 * @param pane The selected pane.
 * @param res The navigation receipt.
 */
function showResolvedPane(
	body: z.infer<typeof RequestSchema>,
	resolved: Reading,
	vault: string,
	model: Model,
	pane: PaneRegistration,
	res: Response,
): void {
	const reading = addressedReading(model, resolved);
	const settings = extractDisplaySettings(reading);
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
		...(settings === undefined ? {} : { settings }),
		revision: model.revision,
		repository,
		checkout,
		paneId: pane.paneId,
		...paneResponse(pane),
		...(chose === undefined ? {} : { chose }),
	});
}

/**
 * Apply browser display settings (layout, theme, hover-light) in place without navigating. The
 * settings belong to the browser, not to a model, so the vault the caller runs in does not narrow
 * which pane they reach.
 * @param body The parsed request carrying only display settings.
 * @param res The HTTP response.
 */
function applyDisplaySettingsOnly(body: z.infer<typeof RequestSchema>, res: Response): void {
	const settings = extractDisplaySettings(body.reading);
	if (settings === undefined) {
		res.status(400).json({
			success: false,
			code: "INVALID_REQUEST",
			error: "Provide at least one display setting.",
		});
		return;
	}
	const pane = settingsPane(body.pane, res);
	if (pane === null) return;
	if (!sendKeylessToPane(pane.clientId, { type: "pane_settings", ...settings })) {
		res.status(503).json(noBrowserBody("Changing browser settings"));
		return;
	}
	res.json({
		success: true,
		settings,
		reading: body.reading,
		paneId: pane.paneId,
		...paneResponse(pane),
	});
}

/**
 * Resolve a pane for a vaultless display-settings update.
 * @param spec The optional pane selector.
 * @param res The response used for refusals.
 * @returns The target pane, or null after writing a refusal.
 */
function settingsPane(spec: unknown, res: Response): PaneRegistration | null {
	const live = onScreenPanes();
	if (live.length === 0) {
		res.status(503).json(noBrowserBody("Changing browser settings"));
		return null;
	}
	if (typeof spec === "string" && spec.trim()) {
		try {
			return resolvePane(live, spec);
		} catch (error) {
			res.status(400).json({ success: false, error: messageOf(error) });
			return null;
		}
	}
	const target = live.find((pane) => pane.focused) ?? primaryPane() ?? live[0] ?? null;
	if (target === null) {
		res.status(503).json(noBrowserBody("Changing browser settings"));
	}
	return target;
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
 */
function answerUnread(
	model: Parameters<typeof opensUnread>[0],
	body: z.infer<typeof RequestSchema>,
	vault: string,
	res: Response,
): void {
	const pane = opensUnread(model, body) ? showablePane(vault, body.pane, res) : undefined;
	if (pane === undefined) respond(res, model);
	else if (pane !== null) moveUnread(vault, pane, res);
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
	const body = parsed.data;
	if (isSettingsOnlyRequest(body.reading)) {
		applyDisplaySettingsOnly(body, res);
		return;
	}
	const named = namedVault(queryString(req, "vault") ?? bodyOf(req)["vault"]);
	if (!named.ok) {
		const { status, code, error } = named.refusal;
		res.status(status).json({ success: false, code, error });
		return;
	}
	const vault = named.vault;
	// Only a pane already in this vault has a reading to keep: another vault's scope and focus name
	// subjects of another model.
	const keptTarget = body.reading.keep === true ? tryPane(vault, body.pane) : null;
	const mergedReading = mergeKeptReading(
		body.reading,
		keptTarget?.vault === vault
			? (semanticPaneContextFor(keptTarget.clientId)?.architecture ?? null)
			: null,
	);
	const {
		module,
		flow,
		scope: _scope,
		focus: _focus,
		hideKinds: _kinds,
		hideEffects: _effects,
		onlyKinds: _onlyKinds,
		onlyEffects: _onlyEffects,
		to: _to,
		from: _from,
		select: _select,
		group: _group,
		lens: _lens,
		expand: _expand,
		grammar: _grammar,
		beat: _beat,
		model: _asked,
		file: _file,
		fileRepo: _fileRepo,
		page: _page,
		layout: _layout,
		theme: _theme,
		hoverLight: _hoverLight,
		keep: _keep,
		ephemeralFlow: _ephemeralFlow,
		resolvedEphemeralFlow: _resolvedEphemeralFlow,
		...selectors
	} = mergedReading;
	const model = await readArchitectureModel(vault, module, flow, selectors);
	if (!model.success) {
		answerUnread(model, body, vault, res);
		return;
	}
	const resolved = resolvePaneReading(model, mergedReading);
	if (!resolved.ok) {
		res.status(422).json({ success: false, ...resolved.error });
		return;
	}
	const refused = selectionRefusal(model, resolved.reading, body.agent === true);
	if (refused !== undefined) {
		res.status(422).json({ success: false, ...refused });
		return;
	}
	const pane = showablePane(vault, body.pane, res);
	if (pane !== null) showResolvedPane(body, resolved.reading, vault, model, pane, res);
}

/**
 * Look up the addressed pane without writing a refusal, used only to read `--keep` context.
 * @param vault The addressed vault.
 * @param spec The optional pane selector.
 * @returns The pane, or null when none can be resolved yet.
 */
function tryPane(vault: string, spec: unknown): PaneRegistration | null {
	try {
		return paneFromRequest(vault, spec);
	} catch {
		return null;
	}
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
	const shown = registeredRepositoryOf(vault);
	if (shown === undefined || shown.chosen) {
		return undefined;
	}
	const chosen = chooseKnownCheckout(shown.root);
	if (chosen?.changed !== true) {
		return undefined;
	}
	logger().info(`${act} made ${shown.root} the chosen checkout of ${shown.name}`);
	return { repository: shown.name, checkout: shown.root, replaced: chosen.replaced };
}

/**
 * The pane a show is addressed to, or nothing once the refusal has been sent.
 * @param vault The vault the model is in: an unnamed pane must be one of that vault's.
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
		res.status(503).json(noBrowserBody("Showing a model"));
	}
	return pane;
}

export { showPaneRoute };
