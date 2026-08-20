import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import fs from 'fs';
import logger from '../utils/logger.js';
import {
  EXCALIDRAW_ELEMENT_TYPES,
  ServerElement,
  ExcalidrawElementType
} from '../types.js';
import { EXPRESS_SERVER_URL } from './config.js';
import {
  updateElementOnCanvas,
  deleteElementOnCanvas,
  getElementFromCanvas,
  createElementOnCanvas,
  batchCreateElementsOnCanvas,
  getElements,
  getPanes,
  getSelection,
  openPane,
  closePane,
  searchElements,
  clearCanvas,
  exportImage,
  setViewport,
  saveSnapshot,
  getSnapshot,
  sendMermaid,
  setRequestedBoard,
  ApiResponse
} from './canvas-client.js';
import { sanitizeFilePath, prepareElement, prepareElementUpdate } from './normalize.js';
import {
  alignElements,
  distributeElements,
  setElementsLocked,
  groupElements,
  ungroupElements,
  duplicateElements
} from './element-ops.js';
import { buildSceneFile, importScene } from './scene-io.js';
import {
  listBoardsOnCanvas,
  boardHeading,
  openBoard,
  newBoard,
  saveBoard,
  boardConflictOf,
  compareBoardsOnCanvas
} from './canvas-client.js';
import {
  readCatalogue,
  catalogueText,
  insertStencil,
  AmbiguousStencilError,
  UnknownStencilError
} from './library-catalogue.js';
import { wrapSceneAsObsidianMd } from './obsidian-md.js';
import { describeScene } from './describe.js';
import {
  KINDS,
  demotionSummary,
  normalizeKind,
  planDemotion,
  planPromotion,
  promotionSummary,
  resolveBinding,
  validateNodeId
} from './promote.js';
import { exportToExcalidrawUrl } from './share-url.js';
import { DIAGRAM_DESIGN_GUIDE } from './design-guide.js';
import { sceneState, ensureCanvasReadyForMcpTool, toolNeedsCanvasBeforeDispatch } from './canvas-state.js';

// Points schema: accept both {x, y} objects and [x, y] tuples
const PointObjectSchema = z.object({ x: z.number(), y: z.number() });
const PointTupleSchema = z.tuple([z.number(), z.number()]);
const PointSchema = z.union([PointObjectSchema, PointTupleSchema]);

// Schema definitions using zod
const ElementSchema = z.object({
  id: z.string().optional(),
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES) as [ExcalidrawElementType, ...ExcalidrawElementType[]]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  points: z.array(PointSchema).optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.union([z.string(), z.number()]).optional(),
  groupIds: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
  strokeStyle: z.string().optional(),
  roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
  fillStyle: z.string().optional(),
  elbowed: z.boolean().optional(),
  startElementId: z.string().optional(),
  endElementId: z.string().optional(),
  endArrowhead: z.string().optional(),
  startArrowhead: z.string().optional(),
});

const ElementIdSchema = z.object({
  id: z.string()
});

const ElementIdsSchema = z.object({
  elementIds: z.array(z.string())
});

const GroupIdSchema = z.object({
  groupId: z.string()
});

const AlignElementsSchema = z.object({
  elementIds: z.array(z.string()),
  alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom'])
});

const DistributeElementsSchema = z.object({
  elementIds: z.array(z.string()),
  direction: z.enum(['horizontal', 'vertical'])
});

const QuerySchema = z.object({
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES) as [ExcalidrawElementType, ...ExcalidrawElementType[]]).optional(),
  filter: z.record(z.any()).optional(),
  bbox: z.object({
    x_min: z.number().optional(),
    x_max: z.number().optional(),
    y_min: z.number().optional(),
    y_max: z.number().optional()
  }).optional()
});

const ResourceSchema = z.object({
  resource: z.enum(['scene', 'library', 'theme', 'elements'])
});

/**
 * Dispatches one `tools/call` invocation. Era-agnostic on purpose: the same
 * dispatcher backs a 2025-era connection opened with `initialize` and a
 * 2026-07-28 connection that starts with `server/discover` (or with a bare
 * `tools/call`), so tool behaviour can never drift between the two.
 */
export async function callExcalidrawTool(
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  // Which board this call is about, taken from what the client passed and
  // applied to every canvas request the call makes. Set here rather than in 40
  // case arms so that a tool cannot be the one that forgot; cleared afterwards
  // so nothing leaks into the next call. A tool that names no board reaches a
  // canvas that refuses it, which is the point (ADR 0009).
  setRequestedBoard(typeof args?.board === 'string' ? args.board : null);
  try {
    logger.info(`Handling tool call: ${name}`);

    if (toolNeedsCanvasBeforeDispatch(name)) {
      await ensureCanvasReadyForMcpTool();
    }

    switch (name) {
      case 'create_element': {
        const params = ElementSchema.parse(args);
        logger.info('Creating element via MCP', { type: params.type });

        const excalidrawElement = prepareElement(params);

        // Create element directly on HTTP server (no local storage)
        const canvasElement = await createElementOnCanvas(excalidrawElement);

        if (!canvasElement) {
          throw new Error('Failed to create element: HTTP server unavailable');
        }

        logger.info('Element created via MCP and synced to canvas', {
          id: excalidrawElement.id,
          type: excalidrawElement.type,
          synced: !!canvasElement
        });

        return {
          content: [{
            type: 'text',
            text: `Element created successfully!\n\n${JSON.stringify(canvasElement, null, 2)}\n\n✅ Synced to canvas`
          }]
        };
      }
      case 'update_element': {
        const params = ElementIdSchema.merge(ElementSchema.partial()).parse(args);
        const { id, ...updates } = params;

        if (!id) throw new Error('Element ID is required');

        // Fetch the element's actual type so text→label conversion only
        // applies to non-text shapes (update payloads rarely carry `type`)
        const existing = await getElementFromCanvas(id);
        const excalidrawElement = prepareElementUpdate(id, updates, existing?.type);

        // Update element directly on HTTP server (no local storage)
        const canvasElement = await updateElementOnCanvas(excalidrawElement);
        
        if (!canvasElement) {
          throw new Error('Failed to update element: HTTP server unavailable or element not found');
        }
        
        logger.info('Element updated via MCP and synced to canvas', { 
          id: excalidrawElement.id, 
          synced: !!canvasElement 
        });
        
        return {
          content: [{ 
            type: 'text', 
            text: `Element updated successfully!\n\n${JSON.stringify(canvasElement, null, 2)}\n\n✅ Synced to canvas` 
          }]
        };
      }
      
      case 'delete_element': {
        const params = ElementIdSchema.parse(args);
        const { id } = params;

        // Delete element directly on HTTP server (no local storage)
        const canvasResult = await deleteElementOnCanvas(id);

        if (!canvasResult || !(canvasResult as ApiResponse).success) {
          throw new Error('Failed to delete element: HTTP server unavailable or element not found');
        }

        const result = { id, deleted: true, syncedToCanvas: true };
        logger.info('Element deleted via MCP and synced to canvas', result);

        return {
          content: [{
            type: 'text',
            text: `Element deleted successfully!\n\n${JSON.stringify(result, null, 2)}\n\n✅ Synced to canvas`
          }]
        };
      }
      
      case 'query_elements': {
        const params = QuerySchema.parse(args || {});
        const { type, filter, bbox } = params;

        try {
          // Build query parameters
          const queryParams = new URLSearchParams();
          if (type) queryParams.set('type', type);
          if (filter) {
            Object.entries(filter).forEach(([key, value]) => {
              queryParams.set(key, String(value));
            });
          }
          if (bbox) {
            if (bbox.x_min !== undefined) queryParams.set('x_min', String(bbox.x_min));
            if (bbox.x_max !== undefined) queryParams.set('x_max', String(bbox.x_max));
            if (bbox.y_min !== undefined) queryParams.set('y_min', String(bbox.y_min));
            if (bbox.y_max !== undefined) queryParams.set('y_max', String(bbox.y_max));
          }

          // Query elements from HTTP server
          const results = await searchElements(queryParams);

          return {
            content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
          };
        } catch (error) {
          throw new Error(`Failed to query elements: ${(error as Error).message}`);
        }
      }
      case 'get_resource': {
        const params = ResourceSchema.parse(args);
        const { resource } = params;
        logger.info('Getting resource', { resource });

        let result: any;
        switch (resource) {
          case 'scene': {
            let selectedElements: string[] = [];
            try {
              await ensureCanvasReadyForMcpTool();
              selectedElements = (await getSelection()).elementIds;
            } catch (error) {
              logger.warn(`Could not read selection: ${(error as Error).message}`);
            }
            result = {
              theme: sceneState.theme,
              viewport: sceneState.viewport,
              selectedElements
            };
            break;
          }
          case 'library':
          case 'elements':
            try {
              await ensureCanvasReadyForMcpTool();
              // Get elements from HTTP server
              result = {
                elements: await getElements()
              };
            } catch (error) {
              throw new Error(`Failed to get elements: ${(error as Error).message}`);
            }
            break;
          case 'theme':
            result = {
              theme: sceneState.theme
            };
            break;
          default:
            throw new Error(`Unknown resource: ${resource}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'group_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          const result = await groupElements(elementIds);

          // Keep the legacy in-process group map in sync
          sceneState.groups.set(result.groupId, elementIds);

          logger.info('Grouping elements', { elementIds, groupId: result.groupId, successCount: result.successCount });

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          throw new Error(`Failed to group elements: ${(error as Error).message}`);
        }
      }
      case 'ungroup_elements': {
        const params = GroupIdSchema.parse(args);
        const { groupId } = params;

        try {
          // Prefer the legacy in-process member list when present; otherwise
          // canvas element groupIds are the source of truth (works even after
          // an MCP server restart).
          const knownMemberIds = sceneState.groups.get(groupId);
          const result = await ungroupElements(groupId, knownMemberIds);
          sceneState.groups.delete(groupId);

          logger.info('Ungrouping elements', { groupId, elementIds: result.elementIds, successCount: result.successCount });

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          throw new Error(`Failed to ungroup elements: ${(error as Error).message}`);
        }
      }
      case 'align_elements': {
        const params = AlignElementsSchema.parse(args);
        const { elementIds, alignment } = params;
        logger.info('Aligning elements', { elementIds, alignment });

        const result = await alignElements(elementIds, alignment);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'distribute_elements': {
        const params = DistributeElementsSchema.parse(args);
        const { elementIds, direction } = params;
        logger.info('Distributing elements', { elementIds, direction });

        const result = await distributeElements(elementIds, direction);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'lock_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          const { successCount } = await setElementsLocked(elementIds, true);

          const result = { locked: true, elementIds, successCount };
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          throw new Error(`Failed to lock elements: ${(error as Error).message}`);
        }
      }
      case 'unlock_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          const { successCount } = await setElementsLocked(elementIds, false);

          const result = { unlocked: true, elementIds, successCount };
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          throw new Error(`Failed to unlock elements: ${(error as Error).message}`);
        }
      }
      case 'create_from_mermaid': {
        const params = z.object({
          mermaidDiagram: z.string(),
          config: z.object({
            startOnLoad: z.boolean().optional(),
            flowchart: z.object({
              curve: z.enum(['linear', 'basis']).optional()
            }).optional(),
            themeVariables: z.object({
              fontSize: z.string().optional()
            }).optional(),
            maxEdges: z.number().optional(),
            maxTextSize: z.number().optional()
          }).optional()
        }).parse(args);

        logger.info('Creating Excalidraw elements from Mermaid diagram via MCP', {
          diagramLength: params.mermaidDiagram.length,
          hasConfig: !!params.config
        });

        try {
          // Send the Mermaid diagram to the frontend via the API
          // The frontend will use mermaid-to-excalidraw to convert it
          const result = await sendMermaid(params.mermaidDiagram, params.config);

          logger.info('Mermaid diagram sent to frontend for conversion', {
            success: result.success
          });

          return {
            content: [{
              type: 'text',
              text: `Mermaid diagram sent for conversion!\n\n${JSON.stringify(result, null, 2)}\n\n⚠️  Note: The actual conversion happens in the frontend canvas with DOM access. Open the canvas at ${EXPRESS_SERVER_URL} to see the diagram rendered.`
            }]
          };
        } catch (error) {
          throw new Error(`Failed to process Mermaid diagram: ${(error as Error).message}`);
        }
      }
      case 'batch_create_elements': {
        const params = z.object({ elements: z.array(ElementSchema) }).parse(args);
        logger.info('Batch creating elements via MCP', { count: params.elements.length });

        const createdElements: ServerElement[] = params.elements.map(elementData => prepareElement(elementData));

        const canvasElements = await batchCreateElementsOnCanvas(createdElements);

        if (!canvasElements) {
          throw new Error('Failed to batch create elements: HTTP server unavailable');
        }

        const result = {
          success: true,
          elements: canvasElements,
          count: canvasElements.length,
          syncedToCanvas: true
        };

        logger.info('Batch elements created via MCP and synced to canvas', {
          count: result.count,
          synced: result.syncedToCanvas
        });

        return {
          content: [{
            type: 'text',
            text: `${result.count} elements created successfully!\n\n${JSON.stringify(result, null, 2)}\n\n${result.syncedToCanvas ? '✅ All elements synced to canvas' : '⚠️  Canvas sync failed (elements still created locally)'}`
          }]
        };
      }
      case 'get_element': {
        const params = ElementIdSchema.parse(args);
        const { id } = params;

        const element = await getElementFromCanvas(id);
        if (!element) {
          throw new Error(`Element ${id} not found`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(element, null, 2) }]
        };
      }

      case 'clear_canvas': {
        logger.info('Clearing canvas via MCP');

        const data = await clearCanvas();

        return {
          content: [{
            type: 'text',
            text: `Canvas cleared.\n\n${JSON.stringify(data, null, 2)}`
          }]
        };
      }
      case 'export_scene': {
        const params = z.object({
          filePath: z.string().optional()
        }).parse(args || {});

        logger.info('Exporting scene via MCP');

        const { scene, elementCount } = await buildSceneFile();

        if (params.filePath) {
          const safePath = sanitizeFilePath(params.filePath);
          const asObsidianMd = params.filePath.endsWith('.md');
          const output = asObsidianMd
            ? wrapSceneAsObsidianMd(scene)
            : JSON.stringify(scene, null, 2);
          fs.writeFileSync(safePath, output, 'utf-8');
          return {
            content: [{
              type: 'text',
              text: `Scene exported to ${safePath} (${elementCount} elements${asObsidianMd ? ', Obsidian .excalidraw.md format' : ''})`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(scene, null, 2)
          }]
        };
      }
      case 'import_scene': {
        const params = z.object({
          filePath: z.string().optional(),
          data: z.string().optional(),
          mode: z.enum(['replace', 'merge'])
        }).parse(args);

        logger.info('Importing scene via MCP', { mode: params.mode });

        const result = await importScene(params);

        return {
          content: [{
            type: 'text',
            text: `Imported ${result.count} elements${result.fileCount > 0 ? ` and ${result.fileCount} files` : ''} (mode: ${result.mode})\n\n✅ Synced to canvas`
          }]
        };
      }
      case 'export_to_image': {
        const params = z.object({
          format: z.enum(['png', 'svg']),
          filePath: z.string().optional(),
          background: z.boolean().optional(),
          pane: z.string().min(1).optional()
        }).parse(args);

        logger.info('Exporting to image via MCP', { format: params.format, pane: params.pane });

        const result = await exportImage(params.format, params.background ?? true, params.pane);

        if (params.filePath) {
          const safeImagePath = sanitizeFilePath(params.filePath);
          if (params.format === 'svg') {
            fs.writeFileSync(safeImagePath, result.data, 'utf-8');
          } else {
            fs.writeFileSync(safeImagePath, Buffer.from(result.data, 'base64'));
          }
          return {
            content: [{
              type: 'text',
              text: `Image exported to ${safeImagePath} (format: ${params.format})`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: params.format === 'svg'
              ? result.data
              : `Base64 ${params.format} data (${result.data.length} chars). Use filePath to save to disk.`
          }]
        };
      }
      case 'duplicate_elements': {
        const params = z.object({
          elementIds: z.array(z.string()),
          offsetX: z.number().optional(),
          offsetY: z.number().optional()
        }).parse(args);

        logger.info('Duplicating elements via MCP', { count: params.elementIds.length });

        const { duplicates, canvasElements, offsetX, offsetY } = await duplicateElements(
          params.elementIds,
          params.offsetX ?? 20,
          params.offsetY ?? 20
        );

        return {
          content: [{
            type: 'text',
            text: `Duplicated ${duplicates.length} elements (offset: ${offsetX}, ${offsetY})\n\n${JSON.stringify(canvasElements, null, 2)}\n\n✅ Synced to canvas`
          }]
        };
      }
      case 'snapshot_scene': {
        const params = z.object({ name: z.string() }).parse(args);
        logger.info('Saving snapshot via MCP', { name: params.name });

        const result = await saveSnapshot(params.name);

        return {
          content: [{
            type: 'text',
            text: `Snapshot "${params.name}" saved (${result.elementCount} elements)\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      }
      case 'restore_snapshot': {
        const params = z.object({ name: z.string() }).parse(args);
        logger.info('Restoring snapshot via MCP', { name: params.name });

        // Fetch the snapshot
        let snapshot: { name: string; elements: ServerElement[]; createdAt: string };
        try {
          snapshot = await getSnapshot(params.name);
        } catch {
          throw new Error(`Snapshot "${params.name}" not found`);
        }

        // Clear current canvas, then restore elements
        await clearCanvas();
        const restored = await batchCreateElementsOnCanvas(snapshot.elements);
        if (!restored) {
          throw new Error(`Failed to restore snapshot "${params.name}": HTTP server unavailable (canvas was cleared)`);
        }

        return {
          content: [{
            type: 'text',
            text: `Snapshot "${params.name}" restored (${snapshot.elements.length} elements)\n\n✅ Canvas updated`
          }]
        };
      }
      case 'list_boards': {
        const params = z.object({ repo: z.string().optional() }).parse(args || {});
        logger.info('Listing boards via MCP', { repo: params.repo });
        const result = await listBoardsOnCanvas(params.repo);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            vault: result.vault,
            ...(result.repo ? { repo: result.repo, scanned: result.scanned } : {}),
            boards: result.boards,
            open: result.open,
            onScreen: result.onScreen
          }, null, 2) }]
        };
      }
      case 'open_board': {
        const params = z.object({
          board: z.string().min(1),
          variant: z.string().optional(),
          level: z.string().optional(),
          reload: z.boolean().optional(),
          pane: z.string().optional()
        }).parse(args ?? {});
        logger.info('Opening board via MCP', { board: params.board });
        const result = await openBoard(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'new_board': {
        const params = z.object({
          board: z.string().min(1),
          variant: z.string().optional(),
          level: z.string().optional(),
          pane: z.string().optional()
        }).parse(args ?? {});
        logger.info('Creating board via MCP', { board: params.board });
        const result = await newBoard(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'save_board': {
        const params = z.object({
          name: z.string().optional(),
          variant: z.string().optional(),
          level: z.string().optional(),
          force: z.boolean().optional()
        }).parse(args ?? {});
        logger.info('Saving board via MCP', { name: params.name, force: params.force });
        try {
          const result = await saveBoard(params);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          // A refused write is a decision the human has to make, so it comes
          // back as the message plus the three commands, not as a bare failure
          // string the model has to reconstruct intent from (ADR 0006).
          const conflict = boardConflictOf(error);
          if (!conflict) throw error;
          return {
            content: [{ type: 'text', text: `${conflict.message}\n\n${JSON.stringify({ conflict }, null, 2)}` }],
            isError: true
          };
        }
      }
      case 'compare_boards': {
        const params = z.object({
          from: z.string().min(1),
          to: z.string().optional()
        }).parse(args ?? {});
        logger.info('Comparing boards via MCP', { from: params.from, to: params.to });
        const result = await compareBoardsOnCanvas(params);
        // The whole diff, unabridged. This tool exists to be sufficient rather
        // than narratable: the model reading it is the one that will compose
        // the explanation, so summarising here would delete the material it
        // needs. See src/core/compare.ts.
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      }
      case 'list_library_items': {
        logger.info('Listing library items via MCP');
        const catalogue = await readCatalogue();
        // The table, not the JSON: 111 stencils as pretty-printed objects is a
        // thousand lines of context to answer "what can I draw with", and the
        // table already carries every field a caller picks on.
        return {
          content: [{ type: 'text', text: catalogueText(catalogue) }]
        };
      }
      case 'insert_library_item': {
        const params = z.object({
          name: z.string().min(1).optional(),
          source: z.string().min(1).optional(),
          itemId: z.string().min(1).optional(),
          x: z.number(),
          y: z.number()
        }).refine(
          value => value.name !== undefined || value.itemId !== undefined,
          { message: 'Give the stencil a name (from list_library_items), or its itemId.' }
        ).parse(args ?? {});
        logger.info('Inserting library item via MCP', { name: params.name, itemId: params.itemId });

        try {
          const result = await insertStencil(params);
          // The elements themselves are the stencil's own artwork — dozens of
          // shapes with points and bindings — and the caller asked for a
          // picture, not its geometry. Ids are what a follow-up needs.
          return {
            content: [{
              type: 'text',
              text: `Inserted "${result.name}" from ${result.source ?? 'installed'} at (${result.at.x}, ${result.at.y}) ` +
                `as ${result.count} plain elements.\n\n` +
                JSON.stringify({
                  name: result.name,
                  source: result.source,
                  itemId: result.id,
                  at: result.at,
                  count: result.count,
                  elementIds: result.elements.map(el => el.id)
                }, null, 2)
            }]
          };
        } catch (error) {
          // Which "Database" the human meant is not ours to guess, so the
          // candidates come back named and the call is refused (as save_board
          // refuses a conflicting write) rather than resolved arbitrarily.
          if (error instanceof AmbiguousStencilError) {
            return {
              content: [{
                type: 'text',
                text: `${error.message} Call again with source set to one of them, or with itemId.\n\n` +
                  JSON.stringify({ ambiguous: error.wanted, candidates: error.candidates }, null, 2)
              }],
              isError: true
            };
          }
          if (error instanceof UnknownStencilError) {
            return {
              content: [{ type: 'text', text: `${error.message} Call list_library_items to see what is available.` }],
              isError: true
            };
          }
          throw error;
        }
      }
      case 'describe_scene': {
        logger.info('Describing scene via MCP');

        const allElements = await getElements();
        const heading = await boardHeading();

        return {
          content: [{ type: 'text', text: (heading ? heading + '\n\n' : '') + describeScene(allElements) }]
        };
      }
      case 'get_selection': {
        logger.info('Reading canvas selection via MCP');

        const selection = await getSelection();

        return {
          content: [{ type: 'text', text: selection.text }]
        };
      }
      case 'get_panes': {
        logger.info('Reading pane view state via MCP');

        const report = await getPanes();

        return {
          content: [{ type: 'text', text: report.text }]
        };
      }
      case 'open_pane': {
        const params = z.object({ board: z.string().min(1).optional() }).parse(args ?? {});
        logger.info('Opening a pane via MCP', { board: params.board });

        const result = await openPane(params.board ? { board: params.board } : {});
        const place = result.pane?.place ?? 'a new pane';
        const landed = result.board
          ? `"${result.board.board}" is showing in the ${place} pane, beside what was already there. ` +
            `Name it on every call that touches it: board "${result.board.board}".`
          : `Opened the ${place} pane, showing what was already on screen. ` +
            'Point it somewhere with open_board.';
        return {
          content: [{ type: 'text', text: `${landed}\n\n${JSON.stringify(result, null, 2)}` }]
        };
      }
      case 'close_pane': {
        const params = z.object({ pane: z.string().min(1) }).parse(args ?? {});
        logger.info('Closing a pane via MCP', { pane: params.pane });

        const result = await closePane(params.pane);
        return {
          content: [{
            type: 'text',
            text:
              `Closed the ${result.closed?.place ?? params.pane} pane. "${result.closed?.board}" is off ` +
              'the screen and otherwise untouched — still open on the canvas.\n\n' +
              JSON.stringify(result, null, 2)
          }]
        };
      }
      case 'promote_selection':
      case 'demote_selection': {
        const params = z.object({
          kind: z.string().optional(),
          name: z.string().optional(),
          node: z.string().optional(),
          path: z.string().optional(),
          repo: z.string().optional(),
          branch: z.string().optional(),
          commit: z.string().optional(),
          variant: z.string().optional(),
          level: z.string().optional(),
          each: z.boolean().optional(),
          elementIds: z.array(z.string()).optional()
        }).parse(args || {});

        const promoting = name === 'promote_selection';
        logger.info(`${promoting ? 'Promoting' : 'Demoting'} via MCP`);

        const board = await getElements();
        const byId = new Map(board.map(el => [el.id, el]));

        let targets: ServerElement[];
        if (params.elementIds) {
          const missing = params.elementIds.filter(id => !byId.has(id));
          if (missing.length > 0) throw new Error(`No element on the canvas with id ${missing.join(', ')}`);
          targets = params.elementIds.map(id => byId.get(id)!);
        } else {
          const selection = await getSelection();
          if (selection.elementIds.length === 0) {
            throw new Error(
              `Nothing is selected on the board, so there is nothing to ${promoting ? 'promote' : 'demote'}. ` +
              `Ask the human to select the shapes, or pass elementIds.`
            );
          }
          targets = selection.elementIds.map(id => byId.get(id)).filter(Boolean) as ServerElement[];
          if (targets.length === 0) throw new Error('The selected ids are not on the canvas any more.');
        }

        let summary: string;
        let payload: unknown;
        if (promoting) {
          if (!params.kind) throw new Error(`kind is required (one of: ${KINDS.join(', ')})`);
          // No working directory is passed, and none is available to pass.
          // This server was spawned by the client, so its cwd is whatever
          // directory that client happened to be in, invisible to the user and
          // unsettable by them. A relative path here is therefore refused
          // rather than resolved by accident (ADR 0011); an absolute path, or a
          // repo identity plus a path inside it, is how a shell-less client
          // names code.
          const binding = params.path
            ? resolveBinding({
                path: params.path,
                ...(params.repo ? { repo: params.repo } : {}),
                ...(params.branch ? { branch: params.branch } : {}),
                ...(params.commit ? { commit: params.commit } : {})
              }, { kind: 'none', surface: 'MCP' })
            : undefined;
          const plan = planPromotion({
            targets,
            board,
            kind: normalizeKind(params.kind),
            ...(params.name ? { name: params.name } : {}),
            ...(params.node ? { nodeId: validateNodeId(params.node) } : {}),
            ...(binding ? { binding } : {}),
            ...(params.variant ? { variant: params.variant } : {}),
            ...(params.level ? { level: params.level } : {}),
            ...(params.each ? { each: true } : {})
          });
          for (const update of plan.updates) {
            const applied = await updateElementOnCanvas(update as Partial<ServerElement> & { id: string });
            if (!applied) throw new Error(`Failed to write metadata to element ${update.id}: canvas unavailable`);
          }
          summary = promotionSummary(plan, binding?.note);
          payload = plan.nodes;
        } else {
          const plan = planDemotion(targets, board);
          for (const update of plan.updates) {
            const applied = await updateElementOnCanvas(update as Partial<ServerElement> & { id: string });
            if (!applied) throw new Error(`Failed to strip metadata from element ${update.id}: canvas unavailable`);
          }
          summary = demotionSummary(plan);
          payload = plan.nodes;
        }

        return {
          content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(payload, null, 2)}` }]
        };
      }
      case 'get_canvas_screenshot': {
        const params = z.object({
          background: z.boolean().optional(),
          pane: z.string().min(1).optional()
        }).parse(args || {});

        logger.info('Taking canvas screenshot via MCP', { pane: params.pane });

        const result = await exportImage('png', params.background ?? true, params.pane);

        return {
          content: [
            {
              type: 'image' as const,
              data: result.data,
              mimeType: 'image/png'
            },
            {
              type: 'text',
              text: 'Canvas screenshot captured. This is what the diagram currently looks like.'
            }
          ]
        };
      }
      case 'read_diagram_guide': {
        return {
          content: [{ type: 'text', text: DIAGRAM_DESIGN_GUIDE }]
        };
      }

      case 'export_to_excalidraw_url': {
        logger.info('Exporting to excalidraw.com URL');

        const urlExportElements = await getElements();
        const shareUrl = await exportToExcalidrawUrl(urlExportElements);

        return {
          content: [{
            type: 'text',
            text: `Diagram exported to excalidraw.com!\n\nShareable URL: ${shareUrl}\n\nAnyone with this link can view and edit the diagram.`
          }]
        };
      }
      case 'set_viewport': {
        const viewportParams = z.object({
          scrollToContent: z.boolean().optional(),
          scrollToElementIds: z.array(z.string().min(1)).min(1).optional(),
          viewportZoomFactor: z.number().positive().max(1).optional(),
          scrollToElementId: z.string().min(1).optional(),
          zoom: z.number().min(0.1).max(10).optional(),
          offsetX: z.number().optional(),
          offsetY: z.number().optional(),
          // Which pane's camera. Without it the pane that answers for the
          // browser moves, which with one pane on screen is that pane.
          pane: z.string().min(1).optional()
        }).superRefine((params, ctx) => {
          const modes = [
            params.scrollToContent === true,
            params.scrollToElementIds !== undefined,
            params.scrollToElementId !== undefined,
            params.zoom !== undefined || params.offsetX !== undefined || params.offsetY !== undefined
          ].filter(Boolean).length;

          if (modes !== 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Specify exactly one viewport mode: scrollToContent, scrollToElementIds, scrollToElementId, or manual zoom/offset'
            });
          }
          if (params.viewportZoomFactor !== undefined &&
              params.scrollToContent !== true &&
              params.scrollToElementIds === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['viewportZoomFactor'],
              message: 'viewportZoomFactor requires scrollToContent or scrollToElementIds'
            });
          }
        }).parse(args || {});

        logger.info('Setting viewport via MCP', viewportParams);

        const viewportResult = await setViewport(viewportParams);

        if (!viewportResult.success) {
          throw new Error(viewportResult.message || 'Viewport update failed');
        }

        return {
          content: [{
            type: 'text',
            text: `Viewport updated successfully.\n\n${JSON.stringify(viewportResult, null, 2)}`
          }]
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Error handling tool call: ${(error as Error).message}`, { error });
    return {
      content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
      isError: true
    };
  } finally {
    setRequestedBoard(null);
  }
}
