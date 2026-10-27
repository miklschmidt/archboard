// Existing language and infrastructure cases supply static semantic evidence.
// Live model discovery belongs to the public canonical runtime owner.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SemanticBoardSchema,type SemanticBoard } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
/**
 * Load static evidence fixtures for the language engine.
 * @param vault The fixture directory.
 * @param variant The requested draft name.
 * @param every Whether every draft participates.
 * @returns Selected fixture evidence.
 */
function evidence(vault:string,variant?:string,every=false){
 const boards:Array<Omit<BoardToCheck,"board">&{board:SemanticBoard}>=[];
 const skipped:import("#shared/protocol/code-check.ts").CodeCheckSkip[]=[];
 const drafts=new Set<string>();
 const relationshipKinds=readSemanticBoardConfiguration(vault).configuration.relationshipKinds ?? DEFAULT_SEMANTIC_POLICY.relationshipKinds;
 for(const file of readdirSync(vault).filter((name)=>name.endsWith(".semantic.json"))){
  const parsed=SemanticBoardSchema.safeParse(JSON.parse(readFileSync(join(vault,file),"utf8")));
  if(!parsed.success){skipped.push({reason:"board-unreadable",board:file});continue;}
  const board=parsed.data;
  board.variants.filter((state)=>state.lifecycle==="draft").forEach((state)=>drafts.add(state.name));
  const draft=board.variants.find((state)=>state.name===variant&&state.lifecycle==="draft");
  const states=every?board.variants.filter((state)=>state.lifecycle==="draft"):[draft??board.variants.find((state)=>state.id===board.current)].filter((state)=>state!==undefined);
  if(states.length===0)skipped.push({reason:"no-current-variant",board:board.name});
  for(const state of states)boards.push({board,variant:state,file:join(vault,file),named:every||state===draft,relationshipKinds});
 }
 return variant!==undefined&&!boards.some((board)=>board.named)?{ok:false as const,variant,drafts:[...drafts]}:{ok:true as const,boards,skipped};
}
function readBoardsToCheck(vault:string,variant?:string){return evidence(vault,variant);}
function readEveryDraftToCheck(vault:string){const read=evidence(vault,undefined,true);if(!read.ok)throw new Error("Fixture draft selection failed.");return read;}
export {readBoardsToCheck,readEveryDraftToCheck};
