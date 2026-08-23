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
  reportHold
} from './board-hold.js';
import {
  BoardContent,
  BoardWriteConflictError,
  readBoardContent,
  renderContent,
  writeBoardContent
} from './board-io.js';
import { BoardState } from './board-store.js';
import { hashBoardBytes } from './board.js';
import { ChangeOrigin, changeFeed } from './change-feed.js';
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
  delta: BoardWriteDelta;
  /** A valid no-op does not write, notify panes, or advance the feed. */
  write?: boolean;
}

export type BoardMutation<T> = (
  content: BoardContent,
  destinationBefore: BoardContent
) => BoardMutationResult<T>;

export interface ElementMutationPlan<T> {
  input: ElementInputRequest;
  before?: (content: BoardContent) => void;
  value: (applied: AppliedElementInput, content: BoardContent) => T;
  write?: (applied: AppliedElementInput) => boolean;
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
  target?: BoardWriteTarget;
  origin: ChangeOrigin;
  mutation: BoardMutation<T>;
  /** The pane that already has a human change on screen and must skip its echo. */
  clientId?: string | null;
  /** A held board's full-screen report replaces its held copy. */
  fromScreen?: boolean;
  /** Explicit saves act on a hold rather than adding another held write. */
  persistHeld?: boolean;
  force?: boolean;
  saveCommand?: string;
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

const emptyDelta = (): BoardWriteDelta => ({ created: [], updated: [], deleted: [] });

function copyContent(content: BoardContent): BoardContent {
  return {
    ...content,
    elements: new Map(
      Array.from(content.elements, ([id, element]) => [id, structuredClone(element)])
    ),
    files: new Map(
      Array.from(content.files, ([id, file]) => [id, structuredClone(file)])
    )
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
    plan.before?.(content);
    const applied = applyElementInput(content.elements, plan.input);
    return {
      value: plan.value(applied, content),
      delta: {
        created: applied.created,
        updated: applied.updated,
        deleted: applied.deleted
      },
      write: plan.write?.(applied)
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
  tellPanes: TellPanes
): WrittenNote | null {
  if (request.persistHeld !== true && holdWrite(target.key, content, request.fromScreen === true)) {
    recordChange(target, request.origin);
    return null;
  }

  let written: WrittenNote;
  try {
    written = writeBoardContent(target.board, content, {
      force: request.force,
      saveCommand: request.saveCommand
    });
  } catch (error) {
    if (error instanceof BoardWriteConflictError && !isHeld(target.key) && request.persistHeld !== true) {
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

function tellPanesAboutWrite(
  tellPanes: TellPanes,
  target: BoardWriteTarget,
  delta: BoardWriteDelta,
  clientId: string | null,
  timestamp: string
): void {
  const message: ElementsChangedMessage = {
    type: 'elements_changed',
    created: delta.created,
    updated: delta.updated,
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
  const target = request.target ?? request.source;
  const sourceContent = readBoardContent(request.source.board);
  const destinationBefore = target.key === request.source.key
    ? copyContent(sourceContent)
    : copyContent(readBoardContent(target.board));
  const content = copyContent(sourceContent);
  const mutation = request.mutation(content, destinationBefore);
  const delta = mutation.delta ?? emptyDelta();
  const shouldWrite = mutation.write ?? true;
  const appliedAt = new Date().toISOString();

  let written: WrittenNote | null = null;
  if (shouldWrite) {
    written = persist(request, target, content, tellPanes);
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
    elements: touched,
    fingerprint: boardFingerprint(board, content, written),
    ...(wantsDocument ? { document: Array.from(content.elements.values()) } : {})
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
  const { bytes } = renderContent(board.identity, content);
  return {
    elements: content.elements.size,
    note: hashBoardBytes(bytes),
    version: content.version ?? null
  };
}
