import { isDeepStrictEqual } from "node:util";
import { ArchitectureInitializationRequestSchema } from "#shared/schemas/model-portable.ts";
import type { z } from "zod";
import { mintId } from "#shared/rules/ids.ts";
import { DEFAULT_SEMANTIC_POLICY } from "#shared/schemas/semantic-policy.ts";
import { modelRevision, readModelFiles } from "#runtime/store/model-files.ts";
import { archiveContext, archiveTip, readRecord, readCheckpointInputs, ArchiveError } from "#runtime/store/model-archive.ts";
import { activeJournal } from "#runtime/store/model-install.ts";
import { operationRef } from "#runtime/store/model-state.ts";
import { historyResult } from "#runtime/operations/history/result.ts";
import { installArchitectureModel } from "#runtime/operations/history/portable.ts";

/**
 * Initialize one empty canonical planning model through the existing signed installer.
 * @param vault The destination vault.
 * @param input The stable initialization intent.
 * @returns The durable installation receipt or explicit refusal.
 */
async function initializeArchitectureModel(vault: string, input: z.input<typeof ArchitectureInitializationRequestSchema>) {
 const request = ArchitectureInitializationRequestSchema.parse(input);
 return historyResult("MODEL_WRITE_FAILED", async () => {
  const context = await archiveContext(vault);
  const pending = activeJournal(vault);
  const previous = pending?.request.operationId === request.operationId ? pending.checkpoint : await archiveTip(context, operationRef(vault, request.operationId));
  if (previous !== undefined) {
   const record = await readRecord(context, previous);
   const original = record.kind === "checkpoint" ? record.installation : undefined;
   if (original?.type !== "initialize" || !isDeepStrictEqual(ArchitectureInitializationRequestSchema.strip().parse(original), request))
    throw new ArchiveError("OPERATION_REUSED", "This operation identity names another initialization intent.");
   const captured = await readCheckpointInputs(context, previous);
   return installArchitectureModel(vault, { operationId: request.operationId, writer: request.writer, doing: request.doing, expectedRevision: original.expectedRevision, bundle: {format:"archboard-model", schemaVersion:1, model:original.target.model, revision:captured.revision, inputs:[...captured.inputs].map(([path,bytes])=>({path,bytes:bytes.toString("base64")})),history:{tips:[],bundle:null}}}, request);
  }
  const before = readModelFiles(vault);
  if ([...before.inputs.keys()].some((path)=>path.endsWith(".semantic.json")))
   throw new ArchiveError("LEGACY_AUTHORITY", "Inventory this vault and save an explicit migration plan before cutover.");
  if (before.diagnostics.length !== 0 || [...before.inputs.keys()].some((path)=>path !== ".archboard/config.yaml"))
   throw new ArchiveError("TARGET_CHANGED", "Initialization requires an empty vault. Read the existing model or migrate legacy inputs explicitly.");
  const id = mintId(new Set());
  const inputs = new Map(before.inputs);
  inputs.set("model.json", Buffer.from(JSON.stringify({schemaVersion:1,id,name:request.name,current:null}, null, 2)+"\n"));
  if (!inputs.has(".archboard/config.yaml")) inputs.set(".archboard/config.yaml",Buffer.from(Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY)));
  return installArchitectureModel(vault, {operationId:request.operationId,writer:request.writer,doing:request.doing,expectedRevision:before.revision,bundle:{format:"archboard-model",schemaVersion:1,model:id,revision:modelRevision(inputs),inputs:[...inputs].map(([path,bytes])=>({path,bytes:bytes.toString("base64")})),history:{tips:[],bundle:null}}}, request);
 });
}
export { initializeArchitectureModel };
