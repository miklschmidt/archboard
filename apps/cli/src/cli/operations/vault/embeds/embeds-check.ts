import {embedStanding} from "#cli/rules/check/embed-state.ts";
import {writeFileAtomic} from "@archboard/workspace/atomic-write";
import {repoRootOf} from "@archboard/workspace/checkouts";
import {checkoutsReadFrom} from "@archboard/code-binding/resolution";
import {checkoutOfVault} from "@archboard/workspace/vault";
import {readRenderRecipe,replaceRenderRecipe} from "@archboard/renderer/recipe";
import {renderArchitectureFlowOnServer} from "#cli/clients/server/architecture-model.ts";
import {checkoutEmbeds,type CheckoutEmbed} from "#cli/operations/vault/embeds/checkout-embeds.ts";
import {vaultReader} from "#cli/operations/vault/embeds/embed-vaults.ts";
import type {CommandContext} from "#cli/protocol/contract/contract.ts";
import type {EmbedFinding,EmbedFix,EmbedsPart} from "#cli/protocol/check/embeds-answer.ts";
type Recipe=Extract<Extract<ReturnType<typeof readRenderRecipe>,{kind:"recipe"}>["recipe"],{model:unknown}>;
/**
 * Redraw one canonical embed through the existing renderer adapter.
 * @param embed The tracked artifact.
 * @param recipe Its canonical recipe.
 * @param vault The resolved vault.
 * @param fix Whether to replace a changed SVG.
 * @param cached Whether the source is only a cached remote reading.
 * @returns Its finding and any completed repair.
 */
async function inspect(embed:CheckoutEmbed,recipe:Recipe,vault:string,fix:boolean,cached:boolean):Promise<{findings:EmbedFinding[];fixed:EmbedFix[]}>{
 const fresh=await renderArchitectureFlowOnServer(recipe.reading,vault);
 if(!fresh.success||fresh.model!==recipe.model.id)return {findings:[{severity:"warning",code:"EMBED_SOURCE_MISSING",file:embed.file,model:recipe.model,missing:"picture",message:fresh.success?"The vault contains another model.":fresh.diagnostics.map((item)=>`${item.message} ${item.recovery}`).join(" ")}],fixed:[]};
 const read=readRenderRecipe(Buffer.from(fresh.svg));
 if(read.kind!=="recipe"||!("model" in read.recipe))throw new Error("The canonical renderer returned no canonical recipe.");
 const next=read.recipe;
 const standing=embedStanding(recipe,next);
 if(standing==="current")return {findings:[],fixed:[]};
 const changed=next.picture!==recipe.picture;
 const code=recipe.fingerprint===next.fingerprint?"EMBED_RENDERER_CHANGED" as const:"EMBED_OUTDATED" as const;
 if(fix&&!cached&&embed.kind==="svg"){
  writeFileAtomic(embed.path,changed?fresh.svg:Buffer.from(replaceRenderRecipe(embed.bytes,next)));
  return {findings:[],fixed:[changed?{action:"drawn",file:embed.file,code}:{action:"recipe",file:embed.file}]};
 }
 if(!changed)return {findings:[],fixed:[]};
 return {findings:[{severity:cached||code==="EMBED_RENDERER_CHANGED"?"information":"warning",code,file:embed.file,model:recipe.model,message:"The canonical reading draws a different picture.",...(fix?{notFixed:cached?"A cached source cannot replace this artifact.":"Export this canonical reading as SVG before replacing its PNG."}:{})}],fixed:[]};
}
/**
 * Inspect canonical recipes in the addressed checkout without board-owned tracking.
 * @param at The explicit vault or checkout.
 * @param options The repair intent and cancellation signal.
 * @returns The existing embed-check receipt.
 */
async function checkEmbedsAt(at:{vault:string}|{checkout:string},options:{fix:boolean;signal:AbortSignal}):Promise<EmbedsPart>{
 const vault="vault" in at?at.vault:null;
 const root="checkout" in at?at.checkout:await repoRootOf(checkoutOfVault(at.vault),{signal:options.signal});
 if(root===undefined)return {checkout:null,embeds:[],tracked:[],vaults:[],findings:[],fixed:[]};
 const embeds=await checkoutEmbeds(root,options.signal);
 const reader=vaultReader(checkoutsReadFrom(vault),options.signal);
 const findings:EmbedFinding[]=[],fixed:EmbedFix[]=[];
 for(const embed of embeds){
  options.signal.throwIfAborted();
  if(!embed.recipe.ok){findings.push({severity:"warning",code:"EMBED_RECIPE_UNREADABLE",file:embed.file,message:embed.recipe.problem});continue;}
  const recipe=embed.recipe.recipe;
  if(!("model" in recipe)){findings.push({severity:"warning",code:"EMBED_SOURCE_MISSING",file:embed.file,message:"This legacy recipe requires explicit migration and a canonical render. Its original bytes remain unchanged."});continue;}
  // oxlint-disable-next-line no-await-in-loop -- each repair completes before the next artifact starts
  const source=await reader.read(recipe.vault.repo);
  if(!source.ok){findings.push({severity:source.code==="EMBED_VAULT_FETCH_FAILED"?"warning":"information",code:source.code,file:embed.file,model:recipe.model,message:source.reason});continue;}
  // oxlint-disable-next-line no-await-in-loop -- the receipt must preserve every completed repair on cancellation
  const result=await inspect(embed,recipe,source.vault,options.fix,source.read.source==="cache");
  findings.push(...result.findings);fixed.push(...result.fixed);
 }
 return {checkout:root,embeds:embeds.map((embed)=>embed.file),tracked:[],vaults:await reader.vaults(),findings,fixed};
}
/**
 * Inspect the checkout that the command explicitly addressed.
 * @param context The invocation's vault and checkout.
 * @param fix Whether to repair changed SVG artifacts.
 * @returns The embed receipt.
 */
function checkEmbeds(context:Pick<CommandContext,"vault"|"checkout"|"signal">,fix:boolean){
 const options={fix,signal:context.signal};
 if(context.vault!==null)return checkEmbedsAt({vault:context.vault.path},options);
 if(context.checkout!==null)return checkEmbedsAt({checkout:context.checkout},options);
 throw new Error("The embeds check requires an addressed vault or checkout.");
}
export {checkEmbeds,checkEmbedsAt};
