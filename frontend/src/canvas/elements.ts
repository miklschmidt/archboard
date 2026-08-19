// Turning what the server stores into what Excalidraw will render, and back.
//
// Pure and canvas-agnostic on purpose: every pane runs this same code, so a
// second pane costs nothing but a mount. The subtleties here — bindings that
// point at elements that are gone, images and freedraw strokes that
// convertToExcalidrawElements refuses to touch, labels that need recentring —
// are all cases where feeding Excalidraw the server's shape verbatim throws or
// silently draws the wrong thing.

import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ServerElement } from '../types'
import { adoptReusedLabelIds, boundTextsByContainer, planLabelExpansion } from '../../../src/core/labels'

// Helper function to clean elements for Excalidraw
export const cleanElementForExcalidraw = (element: ServerElement): Partial<ExcalidrawElement> => {
  const {
    createdAt,
    updatedAt,
    version,
    syncedAt,
    source,
    syncTimestamp,
    ...cleanElement
  } = element;
  return cleanElement as Partial<ExcalidrawElement>;
}

// Helper function to validate and fix element binding data
const validateAndFixBindings = (elements: Partial<ExcalidrawElement>[]): Partial<ExcalidrawElement>[] => {
  const elementMap = new Map(elements.map(el => [el.id!, el]));

  return elements.map(element => {
    // A loose view on purpose: boundElements and containerId only exist on some
    // members of the element union, and this function runs before we know which.
    const fixedElement = { ...element } as Record<string, any>;

    // Validate and fix boundElements
    if (fixedElement.boundElements) {
      if (Array.isArray(fixedElement.boundElements)) {
        fixedElement.boundElements = fixedElement.boundElements.filter((binding: any) => {
          // Ensure binding has required properties
          if (!binding || typeof binding !== 'object') return false;
          if (!binding.id || !binding.type) return false;

          // Ensure the referenced element exists
          const referencedElement = elementMap.get(binding.id);
          if (!referencedElement) return false;

          // Validate binding type
          if (!['text', 'arrow'].includes(binding.type)) return false;

          return true;
        });

        // Remove boundElements if empty
        if (fixedElement.boundElements.length === 0) {
          fixedElement.boundElements = null;
        }
      } else {
        // Invalid boundElements format, set to null
        fixedElement.boundElements = null;
      }
    }

    // Validate and fix containerId
    if (fixedElement.containerId) {
      const containerElement = elementMap.get(fixedElement.containerId);
      if (!containerElement) {
        // Container doesn't exist, remove containerId
        fixedElement.containerId = null;
      }
    }

    return fixedElement;
  });
}

const isImageElement = (element: Partial<ExcalidrawElement>): boolean => {
  return element.type === 'image'
}

const isFreedrawElement = (element: Partial<ExcalidrawElement>): boolean => {
  return element.type === 'freedraw'
}

const isShapeContainerType = (type: string | undefined): boolean => {
  return type === 'rectangle' || type === 'ellipse' || type === 'diamond'
}

const recenterBoundShapeTextElements = (
  elements: Partial<ExcalidrawElement>[]
): Partial<ExcalidrawElement>[] => {
  const elementMap = new Map(elements.map((el) => [el.id, el]))

  return elements.map((element) => {
    if (element.type !== 'text' || !element.containerId) {
      return element
    }

    const textElement = element as ExcalidrawElement & { type: 'text'; containerId: string; autoResize?: boolean }
    const container = elementMap.get(textElement.containerId) as (ExcalidrawElement & { x: number; y: number; width: number; height: number }) | undefined
    if (!container || !isShapeContainerType(container.type)) {
      return element
    }

    if (textElement.autoResize === false) {
      return element
    }

    if (
      typeof container.x !== 'number' ||
      typeof container.y !== 'number' ||
      typeof container.width !== 'number' ||
      typeof container.height !== 'number' ||
      typeof textElement.width !== 'number' ||
      typeof textElement.height !== 'number'
    ) {
      return element
    }

    return {
      ...element,
      x: container.x + (container.width - textElement.width) / 2,
      y: container.y + (container.height - textElement.height) / 2,
    }
  })
}

const normalizeImageElement = (element: Partial<ExcalidrawElement>): Partial<ExcalidrawElement> => {
  const img = element as any
  return {
    ...img,
    angle: img.angle || 0,
    strokeColor: img.strokeColor || 'transparent',
    backgroundColor: img.backgroundColor || 'transparent',
    fillStyle: img.fillStyle || 'solid',
    strokeWidth: img.strokeWidth || 1,
    strokeStyle: img.strokeStyle || 'solid',
    roughness: img.roughness ?? 0,
    opacity: img.opacity ?? 100,
    groupIds: img.groupIds || [],
    roundness: null,
    seed: img.seed || Math.floor(Math.random() * 1000000),
    version: img.version || 1,
    versionNonce: img.versionNonce || Math.floor(Math.random() * 1000000),
    isDeleted: img.isDeleted ?? false,
    boundElements: img.boundElements || null,
    link: img.link || null,
    locked: img.locked || false,
    status: img.status || 'saved',
    fileId: img.fileId,
    scale: img.scale || [1, 1],
  }
}

const normalizeFreedrawElement = (element: Partial<ExcalidrawElement>): Partial<ExcalidrawElement> => {
  const freedraw = element as any
  return {
    ...freedraw,
    angle: freedraw.angle || 0,
    backgroundColor: freedraw.backgroundColor || 'transparent',
    fillStyle: freedraw.fillStyle || 'solid',
    strokeWidth: freedraw.strokeWidth || 1,
    strokeStyle: freedraw.strokeStyle || 'solid',
    roughness: freedraw.roughness ?? 1,
    opacity: freedraw.opacity ?? 100,
    groupIds: freedraw.groupIds || [],
    roundness: null,
    seed: freedraw.seed || Math.floor(Math.random() * 1000000),
    version: freedraw.version || 1,
    versionNonce: freedraw.versionNonce || Math.floor(Math.random() * 1000000),
    isDeleted: freedraw.isDeleted ?? false,
    boundElements: freedraw.boundElements || null,
    link: freedraw.link || null,
    locked: freedraw.locked || false,
    points: freedraw.points || [],
    pressures: freedraw.pressures || [],
    simulatePressure: freedraw.simulatePressure ?? true,
    lastCommittedPoint: freedraw.lastCommittedPoint || null,
  }
}

// Helper: restore startBinding/endBinding/boundElements after convertToExcalidrawElements strips them
const restoreBindings = (
  convertedElements: readonly any[],
  originalElements: Partial<ExcalidrawElement>[]
): any[] => {
  const originalMap = new Map<string, any>();
  for (const el of originalElements) {
    if (el.id) originalMap.set(el.id, el);
  }

  return convertedElements.map((el: any) => {
    const orig = originalMap.get(el.id);
    if (!orig) return el;

    const patched = { ...el };

    if (orig.startBinding && !el.startBinding) {
      patched.startBinding = orig.startBinding;
    }
    if (orig.endBinding && !el.endBinding) {
      patched.endBinding = orig.endBinding;
    }
    if (orig.boundElements && (!el.boundElements || el.boundElements.length === 0)) {
      patched.boundElements = orig.boundElements;
    }
    if (orig.elbowed !== undefined && el.elbowed === undefined) {
      patched.elbowed = orig.elbowed;
    }

    return patched;
  });
};

// A `label` is a message the server sends, not a property of what is on
// screen: once it has been turned into a bound text element, that text element
// *is* the label, and the copy of the words left on the container is only a
// record of what the last delivery said. Leaving it in the scene makes that
// record outlive its delivery — a human retypes the box, and the next merge
// hands the stale words back to the converter, which writes them over the top
// (TASK-028). So a container that has its text element keeps no seed, and any
// seed reaching containment is therefore news from the message just received.
const dropSpentLabelSeeds = (
  elements: Partial<ExcalidrawElement>[]
): Partial<ExcalidrawElement>[] => {
  const labelled = boundTextsByContainer(elements as Array<Partial<ExcalidrawElement> & { id: string }>)
  if (labelled.size === 0) return elements
  return elements.map((element) => {
    if (!element.id || !labelled.has(element.id)) return element
    if (!('label' in element)) return element
    const { label: _label, ...rest } = element as Record<string, any>
    return rest as Partial<ExcalidrawElement>
  })
}

export const convertElementsPreservingImageProps = (
  elements: Partial<ExcalidrawElement>[]
): Partial<ExcalidrawElement>[] => {
  if (elements.length === 0) return []

  // `label` is expanded into a bound text element by the converter below, and
  // it invents a fresh id every time it does — so a label that already has its
  // text element must either be left alone or rebuilt under that element's
  // existing name. Otherwise the copies breed on every sync (src/core/labels.ts,
  // TASK-024). This runs after binding validation so a reference to a text
  // element that is not on the board no longer counts as a label.
  const { elements: plannedElements, reuse } = planLabelExpansion(
    validateAndFixBindings(elements) as Array<Partial<ExcalidrawElement> & { id: string }>
  )
  const validatedElements = plannedElements as Partial<ExcalidrawElement>[]
  const imageElements = validatedElements.filter(isImageElement).map(normalizeImageElement)
  const freedrawElements = validatedElements.filter(isFreedrawElement).map(normalizeFreedrawElement)
  const nonImageElements = validatedElements.filter(el => !isImageElement(el) && !isFreedrawElement(el))
  // convertToExcalidrawElements may expand labeled shapes into [shape, textElement],
  // so we cannot assume a 1:1 mapping — return all converted elements directly.
  const convertedNonImageElements = convertToExcalidrawElements(nonImageElements as any, { regenerateIds: false })
  const restoredNonImageElements = adoptReusedLabelIds(
    restoreBindings(convertedNonImageElements, nonImageElements) as Array<Partial<ExcalidrawElement> & { id: string }>,
    reuse
  ) as Partial<ExcalidrawElement>[]
  return dropSpentLabelSeeds(
    recenterBoundShapeTextElements([...restoredNonImageElements, ...imageElements, ...freedrawElements])
  )
}
