// Operations on elements that already exist on the canvas: align, distribute,
// group, lock, duplicate. Each one reads the elements from the server, works
// out where they should go, and writes them back, so this module talks to the
// network and is server-side only.
//
// It used to be called `geometry.ts`, which is now the pure measurement module
// underneath it — the browser imports that one, and could not import anything
// that reaches for winston or a fetch client (TASK-038).

import logger from '../utils/logger.js';
import { generateId, ServerElement } from '../types.js';
import {
  getElementFromCanvas,
  updateElementOnCanvas,
  batchCreateElementsOnCanvas,
  getElements
} from './canvas-client.js';
import { extentOf } from './geometry.js';

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Direction = 'horizontal' | 'vertical';

export async function alignElements(
  elementIds: string[],
  alignment: Alignment
): Promise<{ aligned: boolean; elementIds: string[]; alignment: Alignment; successCount: number }> {
  // Fetch all elements
  const elementsToAlign: ServerElement[] = [];
  for (const id of elementIds) {
    const el = await getElementFromCanvas(id);
    if (el) elementsToAlign.push(el);
  }

  if (elementsToAlign.length < 2) {
    throw new Error('Need at least 2 elements to align');
  }

  // Alignment is stated about edges, and an arrow's `x` is not its left edge —
  // it is wherever the arrow was started from, which for a leftward arrow is
  // its right edge (geometry.ts). So the target is worked out in extent space
  // and then applied as a translation of the stored origin, which moves a box
  // and an arrow by the same rule.
  const boxes = new Map(elementsToAlign.map(el => [el.id, extentOf(el)]));
  const box = (el: ServerElement) => boxes.get(el.id)!;
  let edgeFn: (el: ServerElement) => { x?: number; y?: number };
  switch (alignment) {
    case 'left': {
      const minX = Math.min(...elementsToAlign.map(el => box(el).x));
      edgeFn = () => ({ x: minX });
      break;
    }
    case 'right': {
      const maxRight = Math.max(...elementsToAlign.map(el => box(el).x + box(el).width));
      edgeFn = (el) => ({ x: maxRight - box(el).width });
      break;
    }
    case 'center': {
      const centers = elementsToAlign.map(el => box(el).x + box(el).width / 2);
      const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
      edgeFn = (el) => ({ x: avgCenter - box(el).width / 2 });
      break;
    }
    case 'top': {
      const minY = Math.min(...elementsToAlign.map(el => box(el).y));
      edgeFn = () => ({ y: minY });
      break;
    }
    case 'bottom': {
      const maxBottom = Math.max(...elementsToAlign.map(el => box(el).y + box(el).height));
      edgeFn = (el) => ({ y: maxBottom - box(el).height });
      break;
    }
    case 'middle': {
      const middles = elementsToAlign.map(el => box(el).y + box(el).height / 2);
      const avgMiddle = middles.reduce((a, b) => a + b, 0) / middles.length;
      edgeFn = (el) => ({ y: avgMiddle - box(el).height / 2 });
      break;
    }
  }

  // Apply updates
  const updatePromises = elementsToAlign.map(async (el) => {
    const edge = edgeFn(el);
    const coords = {
      ...(edge.x === undefined ? {} : { x: el.x + (edge.x - box(el).x) }),
      ...(edge.y === undefined ? {} : { y: el.y + (edge.y - box(el).y) })
    };
    return await updateElementOnCanvas({ id: el.id, ...coords });
  });
  const results = await Promise.all(updatePromises);
  const successCount = results.filter(r => r).length;

  if (successCount === 0) {
    throw new Error('Failed to align any elements: HTTP server unavailable');
  }

  return { aligned: true, elementIds, alignment, successCount };
}

export async function distributeElements(
  elementIds: string[],
  direction: Direction
): Promise<{ distributed: boolean; elementIds: string[]; direction: Direction; count: number }> {
  // Fetch all elements
  const elementsToDist: ServerElement[] = [];
  for (const id of elementIds) {
    const el = await getElementFromCanvas(id);
    if (el) elementsToDist.push(el);
  }

  if (elementsToDist.length < 3) {
    throw new Error('Need at least 3 elements to distribute');
  }

  // Even gaps are gaps between edges, so this too reasons in extent space and
  // writes back a translation of the stored origin (see alignElements).
  const boxes = new Map(elementsToDist.map(el => [el.id, extentOf(el)]));
  const box = (el: ServerElement) => boxes.get(el.id)!;

  if (direction === 'horizontal') {
    // Sort by x position
    elementsToDist.sort((a, b) => box(a).x - box(b).x);
    const first = elementsToDist[0]!;
    const last = elementsToDist[elementsToDist.length - 1]!;
    const totalSpan = (box(last).x + box(last).width) - box(first).x;
    const totalElementWidth = elementsToDist.reduce((sum, el) => sum + box(el).width, 0);
    const gap = (totalSpan - totalElementWidth) / (elementsToDist.length - 1);

    let currentX = box(first).x;
    for (const el of elementsToDist) {
      await updateElementOnCanvas({ id: el.id, x: el.x + (currentX - box(el).x) });
      currentX += box(el).width + gap;
    }
  } else {
    // Sort by y position
    elementsToDist.sort((a, b) => box(a).y - box(b).y);
    const first = elementsToDist[0]!;
    const last = elementsToDist[elementsToDist.length - 1]!;
    const totalSpan = (box(last).y + box(last).height) - box(first).y;
    const totalElementHeight = elementsToDist.reduce((sum, el) => sum + box(el).height, 0);
    const gap = (totalSpan - totalElementHeight) / (elementsToDist.length - 1);

    let currentY = box(first).y;
    for (const el of elementsToDist) {
      await updateElementOnCanvas({ id: el.id, y: el.y + (currentY - box(el).y) });
      currentY += box(el).height + gap;
    }
  }

  return { distributed: true, elementIds, direction, count: elementsToDist.length };
}

export async function setElementsLocked(
  elementIds: string[],
  locked: boolean
): Promise<{ elementIds: string[]; successCount: number }> {
  const updatePromises = elementIds.map(async (id) => {
    return await updateElementOnCanvas({ id, locked });
  });

  const results = await Promise.all(updatePromises);
  const successCount = results.filter(result => result).length;

  if (successCount === 0) {
    throw new Error(`Failed to ${locked ? 'lock' : 'unlock'} any elements: HTTP server unavailable`);
  }

  return { elementIds, successCount };
}

// Group elements by appending a fresh groupId to each element's groupIds on
// the canvas. Canvas element state (not process-local memory) is the source
// of truth so per-invocation clients like the CLI behave identically.
export async function groupElements(
  elementIds: string[]
): Promise<{ groupId: string; elementIds: string[]; successCount: number }> {
  const groupId = generateId();

  // Fetch existing groups and append new groupId to preserve multi-group membership
  const updatePromises = elementIds.map(async (id) => {
    const element = await getElementFromCanvas(id);
    const existingGroups = element?.groupIds || [];
    const updatedGroupIds = [...existingGroups, groupId];
    return await updateElementOnCanvas({ id, groupIds: updatedGroupIds });
  });

  const results = await Promise.all(updatePromises);
  const successCount = results.filter(result => result).length;

  if (successCount === 0) {
    throw new Error('Failed to group any elements: HTTP server unavailable');
  }

  return { groupId, elementIds, successCount };
}

// Ungroup by finding members via canvas groupIds. Optionally seeded with a
// known member list (the MCP server's legacy in-memory group map) for
// backward compatibility.
export async function ungroupElements(
  groupId: string,
  knownMemberIds?: string[]
): Promise<{ groupId: string; ungrouped: boolean; elementIds: string[]; successCount: number }> {
  let memberIds = knownMemberIds;
  if (!memberIds || memberIds.length === 0) {
    const allElements = await getElements();
    memberIds = allElements
      .filter(el => (el.groupIds || []).includes(groupId))
      .map(el => el.id);
  }

  if (memberIds.length === 0) {
    throw new Error(`Group ${groupId} not found`);
  }

  // Update elements on canvas, removing only this specific groupId
  const updatePromises = memberIds.map(async (id) => {
    // Fetch current element to get existing groupIds
    const element = await getElementFromCanvas(id);
    if (!element) {
      logger.warn(`Element ${id} not found on canvas, skipping ungroup`);
      return null;
    }

    // Remove only the specific groupId, preserve others
    const updatedGroupIds = (element.groupIds || []).filter(gid => gid !== groupId);
    return await updateElementOnCanvas({ id, groupIds: updatedGroupIds });
  });

  const results = await Promise.all(updatePromises);
  const successCount = results.filter(result => result !== null).length;

  if (successCount === 0) {
    throw new Error('Failed to ungroup: no elements were updated (elements may not exist on canvas)');
  }

  return { groupId, ungrouped: true, elementIds: memberIds, successCount };
}

export async function duplicateElements(
  elementIds: string[],
  offsetX = 20,
  offsetY = 20
): Promise<{ duplicates: ServerElement[]; canvasElements: ServerElement[] | null; offsetX: number; offsetY: number }> {
  const duplicates: ServerElement[] = [];
  for (const id of elementIds) {
    const original = await getElementFromCanvas(id);
    if (!original) {
      logger.warn(`Element ${id} not found, skipping duplicate`);
      continue;
    }

    const { createdAt, updatedAt, version, syncedAt, source, syncTimestamp, ...rest } = original as any;
    const duplicate: ServerElement = {
      ...rest,
      id: generateId(),
      x: original.x + offsetX,
      y: original.y + offsetY,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    duplicates.push(duplicate);
  }

  if (duplicates.length === 0) {
    throw new Error('No elements could be duplicated (none found)');
  }

  const canvasElements = await batchCreateElementsOnCanvas(duplicates);
  if (!canvasElements) {
    throw new Error('Failed to duplicate elements: HTTP server unavailable');
  }
  return { duplicates, canvasElements, offsetX, offsetY };
}
