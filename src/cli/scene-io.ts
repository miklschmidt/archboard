import fs from 'fs';

import { ServerElement } from '../types.js';
import {
  getElements,
  getFiles,
  postFiles,
  clearCanvas,
  batchCreateElementsOnCanvas
} from '../core/canvas-client.js';
import { sanitizeFilePath } from '../core/normalize.js';
import { isObsidianExcalidrawMd, extractSceneJsonFromObsidianMd } from '../core/obsidian-md.js';
import { buildScene, ExportedScene } from '../core/scene-document.js';

/** Build a file document from the board returned by the canvas server. */
export async function buildSceneFile(): Promise<ExportedScene> {
  const elements = await getElements();
  let files: Record<string, any> = {};
  try {
    files = await getFiles();
  } catch { /* files endpoint may not exist */ }
  return buildScene(elements, files);
}

export interface ImportResult {
  count: number;
  fileCount: number;
  mode: 'replace' | 'merge';
}

/** Import a JSON or Obsidian scene through the server's element-input entry. */
export async function importScene(options: {
  filePath?: string;
  data?: string;
  mode: 'replace' | 'merge';
}): Promise<ImportResult> {
  let raw: string;
  if (options.filePath) {
    raw = fs.readFileSync(sanitizeFilePath(options.filePath), 'utf-8');
  } else if (options.data) {
    raw = options.data;
  } else {
    throw new Error('Either filePath or data must be provided');
  }
  if (isObsidianExcalidrawMd(raw)) raw = extractSceneJsonFromObsidianMd(raw);

  const sceneData: any = JSON.parse(raw);
  const elements: ServerElement[] = Array.isArray(sceneData)
    ? sceneData
    : (sceneData.elements || []);
  if (elements.length === 0) throw new Error('No elements found in the import data');

  if (options.mode === 'replace') await clearCanvas();
  const created = await batchCreateElementsOnCanvas(elements);
  if (!created) {
    throw new Error('Import failed: canvas rejected the batch create (elements were not restored)');
  }

  let fileCount = 0;
  const importFiles = sceneData.files;
  if (importFiles && typeof importFiles === 'object') {
    const files = Object.values(importFiles);
    if (files.length > 0) {
      try {
        await postFiles(files);
        fileCount = files.length;
      } catch { /* best effort */ }
    }
  }

  return { count: elements.length, fileCount, mode: options.mode };
}
