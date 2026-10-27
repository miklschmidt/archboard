import { readArchitectureModel } from "@archboard/board/store-read";
import { modelContent } from "@archboard/board/content";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import type { SemanticPolicy } from "@archboard/board/policy";
import type { CodeCheckSkip } from "#shared/protocol/code-check.ts";

type Model = Extract<ArchitectureModelRead,{success:true}>;
/** Semantic evidence accepted by the existing code-inspection engine. */
interface BoardToCheck {
 readonly board: Pick<SemanticBoard,"id"|"name"|"variants"|"current">;
 readonly variant: SemanticVariant;
 readonly file:string;
 readonly named:boolean;
 readonly relationshipKinds:SemanticPolicy["relationshipKinds"];
 readonly model?:Model;
}
interface BoardsToCheck {readonly ok:true;readonly boards:readonly BoardToCheck[];readonly skipped:readonly CodeCheckSkip[];}
type NoSuchDraft = Extract<ArchitectureModelRead,{success:false}>;
/**
 * Supply complete canonical meaning to the existing semantic evidence engine.
 * @param model The coherent canonical state.
 * @param predecessor Its exact comparison base, when available.
 * @returns The engine reading without a board document, level, or authored view.
 */
function codeReading(model:Model,predecessor?:Model):BoardToCheck {
 const state=model.selectedState;
 const variant:SemanticVariant={id:state?.id ?? model.manifest.id,name:state?.name ?? model.manifest.name,lifecycle:state?.lifecycle ?? "draft",content:modelContent(model),documents:[...(state?.documents ?? []),...model.modules.flatMap((module)=>module.documents ?? [])],...(predecessor?.selectedState===undefined || predecessor.selectedState===null ? {}:{parent:predecessor.selectedState.id})};
 const previous=predecessor===undefined ? []:[codeReading(predecessor).variant];
 return {board:{id:model.manifest.id,name:model.manifest.name,current:model.manifest.current?.id,variants:[...previous,variant]},variant,file:"model.json",named:state?.lifecycle==="draft",relationshipKinds:model.policy.relationshipKinds,model};
}
/**
 * Read one selected canonical state through the shared runtime.
 * @param vault The addressed vault.
 * @param state The optional state selector.
 * @returns Complete evidence or its structured refusal.
 */
async function readBoardsToCheck(vault:string,state?:string):Promise<BoardsToCheck|NoSuchDraft>{
 const model=await readArchitectureModel(vault,undefined,undefined,{state,compare:true});
 if(!model.success)return model;
 const against=model.comparison?.against;
 const predecessor=against==null ? undefined : await readArchitectureModel(vault,undefined,undefined,{state:against.id,checkpoint:model.comparison?.checkpoint});
 if(predecessor?.success===false)return predecessor;
 return {ok:true,boards:[codeReading(model,predecessor)],skipped:[]};
}
/**
 * Read every independent active proposal without combining equal names.
 * @param vault The addressed vault.
 * @returns Their exact canonical evidence or a structured refusal.
 */
async function readEveryDraftToCheck(vault:string):Promise<BoardsToCheck|NoSuchDraft>{
 const current=readArchitectureModel(vault);
 if(!current.success)return current;
 const readings=await Promise.all(current.proposals.map((proposal)=>readBoardsToCheck(vault,proposal.id)));
 const failure=readings.find((reading)=>!("ok" in reading));
 if(failure!==undefined)return failure;
 return {ok:true,boards:readings.flatMap((reading)=>"ok" in reading?reading.boards:[]),skipped:[]};
}
export {type BoardToCheck,type BoardsToCheck,type NoSuchDraft,readBoardsToCheck,readEveryDraftToCheck};
