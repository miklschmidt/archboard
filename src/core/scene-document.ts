import { ServerElement } from '../types.js';
import { expandElements } from './expand-elements.js';

export interface ExportedScene {
  scene: Record<string, any>;
  elementCount: number;
}

/** Build one Excalidraw document from the supplied board-shape elements. */
export function buildScene(
  sceneElements: ServerElement[],
  sceneFiles: Record<string, any> = {},
  // A board's own note keeps archboard's bookkeeping, because the note is the
  // board (ADR 0015). A file written for another tool does not.
  options: { keepServerFields?: boolean } = {}
): ExportedScene {
  const exportElements = expandElements(sceneElements, {
    deterministic: true,
    ...(options.keepServerFields ? { keepServerFields: true } : {})
  });

  // Only the images these elements actually draw. A scene's `files` map is
  // keyed by the `fileId` an image element carries, so the elements decide
  // what belongs in it (TASK-060).
  const used: Record<string, any> = {};
  for (const element of exportElements as Array<{ fileId?: unknown }>) {
    const id = element.fileId;
    if (typeof id === 'string' && sceneFiles[id]) used[id] = sceneFiles[id];
  }

  const scene: Record<string, any> = {
    type: 'excalidraw',
    version: 2,
    source: 'archboard',
    elements: exportElements,
    appState: {
      viewBackgroundColor: '#ffffff',
      gridSize: null
    },
    ...(Object.keys(used).length > 0 ? { files: used } : {})
  };

  return { scene, elementCount: exportElements.length };
}
