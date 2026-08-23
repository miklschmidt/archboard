import fs from 'fs';
import { ServerElement } from '../types.js';
import {
  getElements,
  getFiles,
  postFiles,
  clearCanvas,
  batchCreateElementsOnCanvas
} from './canvas-client.js';
import { sanitizeFilePath } from './normalize.js';
import { isObsidianExcalidrawMd, extractSceneJsonFromObsidianMd } from './obsidian-md.js';
import { expandElements } from './expand-elements.js';

export interface ExportedScene {
  scene: Record<string, any>;
  elementCount: number;
}

// Build a .excalidraw scene JSON from the current canvas state.
// Elements are expanded from the agent format (label/start/end) into real
// Excalidraw elements (bound text pairs, arrow bindings) so the file renders
// fully on excalidraw.com and in the Obsidian Excalidraw plugin — with
// deterministic ids/seeds so re-exporting an unchanged scene is byte-stable.
export async function buildSceneFile(): Promise<ExportedScene> {
  const sceneElements = await getElements();

  // Fetch files for image elements
  let sceneFiles: Record<string, any> = {};
  try {
    sceneFiles = await getFiles();
  } catch { /* files endpoint may not exist */ }

  return buildScene(sceneElements, sceneFiles);
}

// The same scene, built from elements already in hand. The canvas server saves
// boards out of its own store, so it must not have to fetch itself over HTTP —
// and it must produce byte-identical output to `export`, which is what keeps
// export idempotent and import/export lossless no matter which path wrote the
// file.
export function buildScene(
  sceneElements: ServerElement[],
  sceneFiles: Record<string, any> = {},
  // A board's own note keeps archboard's bookkeeping, because the note is the
  // board (ADR 0015) and one of those fields exists nowhere else: `source`,
  // which says a human drew an element. A file written for another tool does
  // not.
  options: { keepServerFields?: boolean } = {}
): ExportedScene {
  const exportElements = expandElements(sceneElements, {
    deterministic: true,
    ...(options.keepServerFields ? { keepServerFields: true } : {})
  });

  // Only the images these elements actually draw. A scene's `files` map is
  // keyed by the `fileId` an image element carries, so the elements decide what
  // belongs in it — nothing else in the format says which images are whose.
  // This is the one place a scene is assembled, so filtering here covers the
  // board note, `export --out` and anything else that writes a scene at once
  // (TASK-060).
  const used: Record<string, any> = {};
  for (const element of exportElements as Array<{ fileId?: unknown }>) {
    const id = element.fileId;
    if (typeof id === 'string' && sceneFiles[id]) used[id] = sceneFiles[id];
  }

  const excalidrawScene: Record<string, any> = {
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

  return { scene: excalidrawScene, elementCount: exportElements.length };
}

export interface ImportResult {
  count: number;
  fileCount: number;
  mode: 'replace' | 'merge';
}

// Import elements from a .excalidraw JSON file, an Obsidian .excalidraw.md
// file, or raw JSON data
export async function importScene(options: {
  filePath?: string;
  data?: string;
  mode: 'replace' | 'merge';
}): Promise<ImportResult> {
  let raw: string;
  if (options.filePath) {
    const safeImportPath = sanitizeFilePath(options.filePath);
    raw = fs.readFileSync(safeImportPath, 'utf-8');
  } else if (options.data) {
    raw = options.data;
  } else {
    throw new Error('Either filePath or data must be provided');
  }
  if (isObsidianExcalidrawMd(raw)) {
    raw = extractSceneJsonFromObsidianMd(raw);
  }
  const sceneData: any = JSON.parse(raw);

  // Extract elements from .excalidraw format or raw array
  const importElements: ServerElement[] = Array.isArray(sceneData)
    ? sceneData
    : (sceneData.elements || []);

  if (importElements.length === 0) {
    throw new Error('No elements found in the import data');
  }

  // If replace mode, clear first
  if (options.mode === 'replace') {
    await clearCanvas();
  }

  // The server's element-input entry owns ids, timestamps and all conversion.
  const created = await batchCreateElementsOnCanvas(importElements);
  if (!created) {
    // Especially important in replace mode: the canvas was already cleared,
    // so a silently swallowed failure here would report success on data loss
    throw new Error('Import failed: canvas rejected the batch create (elements were not restored)');
  }

  // Import files if present (for image elements)
  let importedFileCount = 0;
  const importFiles = sceneData.files;
  if (importFiles && typeof importFiles === 'object') {
    const fileList = Object.values(importFiles);
    if (fileList.length > 0) {
      try {
        await postFiles(fileList);
        importedFileCount = fileList.length;
      } catch { /* best effort */ }
    }
  }

  return { count: importElements.length, fileCount: importedFileCount, mode: options.mode };
}
