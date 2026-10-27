import type {Request,Response} from "express";
import {z} from "zod";
import {ArchitecturePaneReadingSchema} from "@archboard/board/pane-context";
import {readArchitectureModel} from "@archboard/board/store-read";
import {projectModel} from "@archboard/board/content";
import {publishPaneContext} from "@archboard/workbench/server";
import {paneFromRequest,paneResponse,sendToPane} from "@archboard/workbench/panes";
import type {PaneRegistration} from "@archboard/server-lifecycle/panes";
import {messageOf,vaultOfRequest} from "@archboard/workbench/host";
import {logger} from "@archboard/diagnostics/logger";
import {arrivedOnBoard,noBrowserBody} from "#server/routes/panes/pane-routes.ts";
import {movePaneVault} from "#server/state/pane-vaults/pane-vaults.ts";
import {placeOfVault} from "@archboard/workspace/repository-listing";
import {followRegistry} from "#server/routes/repositories/repository-routes.ts";
import {chooseKnownCheckout,registeredRepositoryOfVault as registeredRepositoryOf} from "@archboard/workspace/checkouts";
import {respond} from "#server/routes/architecture/model-response.ts";
const RequestSchema=z.strictObject({vault:z.string().optional(),pane:z.string().optional(),agent:z.boolean().optional(),session:z.string().optional(),reading:ArchitecturePaneReadingSchema});
/**
 * Resolve a canonical reading before pointing the existing pane at it.
 * @param req The explicit vault and reading.
 * @param res The navigation receipt or refusal.
 */
async function showPaneRoute(req:Request,res:Response):Promise<void>{
 const parsed=RequestSchema.safeParse(req.body);
 if(!parsed.success){res.status(400).json({success:false,code:"INVALID_REQUEST",error:z.prettifyError(parsed.error)});return;}
 const body=parsed.data, vault=vaultOfRequest(req), request=body.reading;
 const {module,flow,scope,focus,hideKinds,hideGroups,grammar,beat,model:asked,...selectors}=request;
 const model=await readArchitectureModel(vault,module,flow,selectors);
 if(!model.success){respond(res,model);return;}
 if(asked!==undefined&&![model.manifest.id,model.manifest.name].includes(asked)){
  res.status(409).json({success:false,code:"TARGET_CHANGED",error:"The addressed vault contains another model."});return;
 }
 if(grammar!=="architecture"&&model.selectedFlow===null){res.status(422).json({success:false,code:"FLOW_REQUIRED",error:"Select an authored flow for this grammar."});return;}
 const projection=projectModel(model,scope??model.selectedModule??null,focus??null,{hideKinds,hideGroups});
 if(projection.missing||projection.missingFocus.length!==0){res.status(422).json({success:false,code:"MODULE_NOT_FOUND",error:"The requested scope or focus is unavailable."});return;}
 if(request.walkthrough!==undefined&&(!model.playback||model.playback.beats.some((entry)=>entry.status!=="ready")||(beat??0)>=model.playback.beats.length)){
  res.status(422).json({success:false,code:"WALKTHROUGH_NOT_FOUND",error:"The requested complete walkthrough or beat is unavailable."});return;
 }
 const pane=showablePane(vault,body.pane,res);
 if(pane===null)return;
 const reading={...selectors,model:model.manifest.id,grammar,scope:scope??model.selectedModule??undefined,focus,hideKinds,hideGroups,flow:model.selectedFlow??undefined,...(model.playback===undefined?{}:{walkthrough:model.playback.walkthrough.id,beat:beat??0})};
 const chose=body.agent===true?chooseShownCheckout(vault):undefined;
 movePaneVault(pane.clientId,vault);
 const {repository,checkout}=placeOfVault(vault);
 sendToPane(pane.clientId,{type:"pane_model",model:model.manifest.id,reading,revision:model.revision,vault,repository},`model:${model.manifest.id}`);
 arrivedOnBoard(pane.clientId,`model:${model.manifest.id}`);
 publishPaneContext(pane.clientId,"focus",[]);
 if(chose!==undefined)followRegistry();
 res.json({success:true,model:model.manifest.id,reading,revision:model.revision,repository,checkout,paneId:pane.paneId,...paneResponse(pane),...(chose===undefined?{}:{chose})});
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

export {chooseShownCheckout,showPaneRoute,type ShowChoice};
