// One request-local path from a board note to the next board note.
//
// The write-boundary middleware owns the lease and version precondition (ADR
// 0016). This module runs synchronously inside that lease: it reads the source
// note, validates and applies the whole mutation to an isolated copy, writes
// the destination through board-io, records the change feed, tells the panes,
// and shapes the HTTP answer. There is deliberately no await between the read
// and the write (ADR 0015).

import { ExcalidrawFile, ElementsChangedMessage, ServerElement, WebSocketMessage } from '../types.js';
import {
  AppliedElementInput,
  applyElementInput,
  ElementInputRequest
} from './apply-element-input.js';
import {
  beginHold,
  holdMessage,
  holdWrite,
  isHeld,
  releaseHold,
  reportHold,
  writesBoardNote
} from './board-hold.js';
import {
  BoardContent,
  BoardWriteConflictError,
  readBoardContent,
  renderContent,
  writeBoardContent
} from './board-io.js';
import { BoardState, copyElements } from './board-store.js';
import { hashBoardBytes } from './board.js';
import { ChangeOrigin, changeFeed } from './change-feed.js';
import { presentElements, stripBindingPresentationLinks } from './presentation.js';
import logger from '../utils/logger.js';

export type WrittenNote = ReturnType<typeof writeBoardContent>;

export interface BoardWriteTarget {
  key: string;
  board: BoardState;
}

export interface BoardWriteDelta {
  created: ServerElement[];
  updated: ServerElement[];
  deleted: string[];
  filesAdded?: ExcalidrawFile[];
  filesDeleted?: string[];
}

export interface BoardMutationResult<T> {
  value: T;
  delta?: Partial<BoardWriteDelta>;
  /** A valid no-op does not write, notify panes, or advance the feed. */
  write?: boolean;
  /** A pane supplied its whole scene rather than a delta. */
  wholeScene?: boolean;
}

export type BoardMutation<T> = (
  content: BoardContent,
  destinationBefore: BoardContent
) => BoardMutationResult<T>;

export interface ElementMutationPlan<T> {
  input: ElementInputRequest;
  /** Present for a pane change report; true means its input is the whole scene. */
  wholeScene?: boolean;
  value: (applied: AppliedElementInput, content: BoardContent) => T;
}

export interface BoardWriteAnswerContext<T> {
  source: BoardWriteTarget;
  target: BoardWriteTarget;
  content: BoardContent;
  value: T;
  delta: BoardWriteDelta;
  written: WrittenNote | null;
  appliedAt: string;
}

export interface BoardWriteRequest<T> {
  source: BoardWriteTarget;
  origin: ChangeOrigin;
  mutation: BoardMutation<T>;
  /** The pane that already has a human change on screen and must skip its echo. */
  clientId?: string | null;
  /** An explicit save writes this target and resolves any hold after persistence. */
  save?: {
    target: BoardWriteTarget;
    force?: boolean;
  };
  afterPersist?: (context: BoardWriteAnswerContext<T>) => void;
  answer: (context: BoardWriteAnswerContext<T>) => Record<string, unknown>;
}

export type TellPanes = (message: WebSocketMessage, board: string) => void;

export class BoardMutationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'BoardMutationError';
  }
}

const completeDelta = (delta?: Partial<BoardWriteDelta>): BoardWriteDelta => ({
  created: delta?.created ?? [],
  updated: delta?.updated ?? [],
  deleted: delta?.deleted ?? [],
  ...(delta?.filesAdded ? { filesAdded: delta.filesAdded } : {}),
  ...(delta?.filesDeleted ? { filesDeleted: delta.filesDeleted } : {})
});

function copyContent(content: BoardContent): BoardContent {
  return {
    ...content,
    elements: new Map(copyElements(content.elements.values()).map(element => [element.id, element])),
    // File records are never mutated during a board write. Copy the map so
    // membership can change without cloning base64 image payloads.
    files: new Map(content.files)
  };
}

/**
 * Build an element mutation without giving a route direct access to the
 * converter. applyElementInput remains one stage inside writeBoard.
 */
export function elementMutation<T>(
  prepare: (content: BoardContent) => ElementMutationPlan<T>
): BoardMutation<T> {
  return (content) => {
    const plan = prepare(content);
    if (plan.wholeScene) content.elements.clear();
    const applied = applyElementInput(content.elements, {
      ...plan.input,
      deletes: plan.wholeScene ? [] : plan.input.deletes
    });
    const changed = applied.created.length > 0 || applied.updated.length > 0 || applied.deleted.length > 0;
    return {
      value: plan.value(applied, content),
      delta: {
        created: applied.created,
        updated: applied.updated,
        deleted: applied.deleted
      },
      // When wholeScene is present this is a pane report. Empty deltas do not
      // write, while a full report must replace the held copy even when empty.
      write: plan.wholeScene === undefined ? undefined : plan.wholeScene || changed,
      wholeScene: plan.wholeScene
    };
  };
}

function recordChange(target: BoardWriteTarget, origin: ChangeOrigin): void {
  changeFeed.record(
    target.key,
    target.board.identity,
    () => Array.from(readBoardContent(target.board).elements.values()),
    origin
  );
}

function persist<T>(
  request: BoardWriteRequest<T>,
  target: BoardWriteTarget,
  content: BoardContent,
  wholeScene: boolean,
  tellPanes: TellPanes
): WrittenNote | null {
  // The write boundary owns the canonical document, including held writes
  // that cannot reach their note yet. A browser may have returned the derived
  // link it was shown; keep only the portable binding in live state.
  const portable = stripBindingPresentationLinks(content.elements.values());
  content.elements = new Map(portable.map(element => [element.id, element]));

  if (!request.save && !writesBoardNote(target.key)) {
    const { bytes } = renderContent(target.board.identity, content);
    content.hash = hashBoardBytes(bytes);
    holdWrite(target.key, content, wholeScene);
    recordChange(target, request.origin);
    return null;
  }

  let written: WrittenNote;
  try {
    written = writeBoardContent(target.board, content, {
      force: request.save?.force,
      saveCommand: target.key === request.source.key
        ? 'board save'
        : `board save --as ${target.key}`
    });
  } catch (error) {
    if (error instanceof BoardWriteConflictError && !isHeld(target.key) && !request.save) {
      const hold = beginHold(target.key, error.conflict, readBoardContent(target.board));
      logger.warn(`Board "${target.key}" has stopped saving: ${holdMessage(target.key, hold)}`);
      tellPanes({ type: 'board_hold', hold: reportHold(target.key, hold) }, target.key);
    }
    throw error;
  }

  target.board.savedAt = new Date().toISOString();
  content.note = written.note;
  content.hash = written.hash;
  content.version = written.version;
  recordChange(target, request.origin);
  return written;
}

function releaseSavedHold<T>(
  request: BoardWriteRequest<T>,
  target: BoardWriteTarget,
  tellPanes: TellPanes
): void {
  if (!request.save) return;
  const hold = releaseHold(request.source.key);
  if (!hold) return;
  const outcome = target.key === request.source.key ? 'overwrite' : 'elsewhere';
  const report = reportHold(request.source.key, hold);
  logger.info(
    `Board "${request.source.key}" is saving again (${outcome}), after ${hold.writes} held change(s).`
  );
  tellPanes({ type: 'board_released', hold: report, outcome } as WebSocketMessage, request.source.key);
}

function tellPanesAboutWrite(
  tellPanes: TellPanes,
  target: BoardWriteTarget,
  delta: BoardWriteDelta,
  clientId: string | null,
  timestamp: string
): void {
  const message: ElementsChangedMessage = {
    type: 'elements_changed',
    created: presentElements(delta.created),
    updated: presentElements(delta.updated),
    deleted: delta.deleted,
    origin: clientId,
    timestamp
  };
  tellPanes(message, target.key);

  if (delta.filesAdded && delta.filesAdded.length > 0) {
    tellPanes({ type: 'files_added', files: delta.filesAdded }, target.key);
  }
  for (const fileId of delta.filesDeleted ?? []) {
    tellPanes({ type: 'file_deleted', fileId }, target.key);
  }
}

/**
 * Run one complete board write. Everything before persist works on a fresh
 * copy, so a mutation that throws cannot leave an earlier upsert applied.
 */
export function writeBoard<T>(request: BoardWriteRequest<T>, tellPanes: TellPanes): Record<string, unknown> {
  const target = request.save?.target ?? request.source;
  const sourceContent = readBoardContent(request.source.board);
  const destinationBefore = target.key === request.source.key
    ? sourceContent
    : readBoardContent(target.board);
  const content = copyContent(sourceContent);
  const mutation = request.mutation(content, destinationBefore);
  const delta = completeDelta(mutation.delta);
  const shouldWrite = mutation.write ?? true;
  const appliedAt = new Date().toISOString();

  let written: WrittenNote | null = null;
  if (shouldWrite) {
    written = persist(request, target, content, mutation.wholeScene === true, tellPanes);
  }

  const context: BoardWriteAnswerContext<T> = {
    source: request.source,
    target,
    content,
    value: mutation.value,
    delta,
    written,
    appliedAt
  };

  if (shouldWrite) {
    if (written) releaseSavedHold(request, target, tellPanes);
    request.afterPersist?.(context);
    tellPanesAboutWrite(tellPanes, target, delta, request.clientId ?? null, appliedAt);
  }

  return request.answer(context);
}

/** What an agent gets after a write, small unless it asked for the document. */
export function agentWriteAnswer(
  board: BoardState,
  content: BoardContent,
  touched: ServerElement[],
  wantsDocument: boolean,
  written?: WrittenNote | null
): Record<string, unknown> {
  return {
    elements: presentElements(touched),
    fingerprint: boardFingerprint(board, content, written),
    ...(wantsDocument ? { document: presentElements(content.elements.values()) } : {})
  };
}

function boardFingerprint(
  board: BoardState,
  content: BoardContent,
  written?: WrittenNote | null
): { elements: number; note: string; version: number | null } {
  if (written) {
    return { elements: content.elements.size, note: written.hash, version: written.version };
  }
  if (content.hash) {
    return { elements: content.elements.size, note: content.hash, version: content.version ?? null };
  }
  const { bytes } = renderContent(board.identity, content);
  return {
    elements: content.elements.size,
    note: hashBoardBytes(bytes),
    version: content.version ?? null
  };
}
