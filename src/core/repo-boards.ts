// Which boards describe a repository.
//
// An agent opening a repository it has never seen knows archboard exists, from
// the skill, but not which board covers what is in front of it. The manual
// answer is a line in that repo's own CLAUDE.md, which works and has to be
// written by somebody.
//
// It does not have to be. Every node carries a binding, and since ADR 0011 a
// binding names a repository identity, so "which boards have nodes bound to
// this repo" is answerable from what archboard already stores. It also answers
// the case a naming convention cannot: one system board spanning five
// repositories belongs to none of them and is named after none of them, yet it
// is the board each of those five repos most wants found.
//
// The scan reads every note in the vault. Boards are megabytes and vaults hold
// dozens, so this is a query to run when an agent arrives somewhere, not one to
// run every turn. There is no index, because an index is a second copy of the
// truth that can be wrong, and the truth is cheap enough to read.

import fs from 'fs';
import { ServerElement } from '../types.js';
import { BoardIdentity, extractSceneElements, listBoards, requireVaultRoot } from './board.js';
import { archboardBlock } from './promote.js';

/** One node on a board, bound to the repository being asked about. */
export interface BoundNode {
  node: string;
  kind?: string;
  /** What the board calls it: the declared name, else the label it shows. */
  name?: string;
  path: string;
  branch?: string;
  commit?: string;
}

export interface RepoBoard {
  key: string;
  identity: BoardIdentity;
  /** Where this was read from: the note on disk, or the copy open on the canvas. */
  source: 'vault' | 'memory';
  file?: string;
  nodes: BoundNode[];
}

export interface RepoBoardsResult {
  repo: string;
  boards: RepoBoard[];
  /** How many boards were looked at, so an empty answer is distinguishable from an empty vault. */
  scanned: number;
  /** Notes that could not be read as a board, named rather than swallowed. */
  unreadable: Array<{ file: string; reason: string }>;
}

/** A board this process holds in memory, which may hold work no note has yet. */
export interface OpenBoard {
  key: string;
  identity: BoardIdentity;
  elements: ServerElement[];
  file?: string;
}

function labelOf(el: ServerElement, elements: ServerElement[]): string | undefined {
  const direct = el.label?.text ?? el.text;
  if (direct) return String(direct);
  for (const other of elements) {
    if (other.type === 'text' && (other as any).containerId === el.id) {
      const text = other.text ?? other.originalText;
      if (text) return String(text);
    }
  }
  return undefined;
}

/**
 * The nodes on one board bound to one repository.
 *
 * Deduplicated by node id, because a node is a set of elements and every one of
 * them carries the same block: a labelled box is two elements and one node.
 */
export function nodesBoundTo(elements: ServerElement[], repo: string): BoundNode[] {
  const byNode = new Map<string, BoundNode>();
  for (const el of elements) {
    const block = archboardBlock(el);
    const binding = block?.binding;
    if (!binding || binding.repo !== repo) continue;
    const id = typeof block?.node === 'string' && block.node ? block.node : el.id;
    if (byNode.has(id)) continue;
    const name = typeof block?.name === 'string' && block.name ? block.name : labelOf(el, elements);
    byNode.set(id, {
      node: id,
      ...(typeof block?.kind === 'string' ? { kind: block.kind } : {}),
      ...(name ? { name } : {}),
      path: binding.path,
      ...(binding.branch ? { branch: binding.branch } : {}),
      ...(binding.commit ? { commit: binding.commit } : {})
    });
  }
  return [...byNode.values()].sort((a, b) => (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
}

/**
 * Every board with at least one node bound to `repo`.
 *
 * A board that is open on the canvas is read from memory rather than from its
 * note, so a binding made a minute ago and not yet saved still answers. That is
 * the same rule `compare` uses, for the same reason: the canvas is where the
 * work is.
 */
export function boardsForRepo(repo: string, open: OpenBoard[] = [], root = requireVaultRoot()): RepoBoardsResult {
  const result: RepoBoardsResult = { repo, boards: [], scanned: 0, unreadable: [] };
  const seen = new Set<string>();

  for (const board of open) {
    seen.add(board.key);
    result.scanned += 1;
    const nodes = nodesBoundTo(board.elements, repo);
    if (nodes.length === 0) continue;
    result.boards.push({
      key: board.key,
      identity: board.identity,
      source: 'memory',
      ...(board.file ? { file: board.file } : {}),
      nodes
    });
  }

  for (const found of listBoards(root)) {
    if (seen.has(found.key)) continue;
    result.scanned += 1;
    let elements: ServerElement[];
    try {
      elements = extractSceneElements(fs.readFileSync(found.file, 'utf-8'));
    } catch (error) {
      result.unreadable.push({ file: found.file, reason: (error as Error).message });
      continue;
    }
    const nodes = nodesBoundTo(elements, repo);
    if (nodes.length === 0) continue;
    result.boards.push({
      key: found.key,
      identity: found.identity,
      source: 'vault',
      file: found.file,
      nodes
    });
  }

  result.boards.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return result;
}

/** The same answer as prose, for a caller narrating it rather than parsing it. */
export function repoBoardsText(result: RepoBoardsResult): string {
  if (result.boards.length === 0) {
    return `No board in the vault has a node bound to ${result.repo} (${result.scanned} board(s) read).`;
  }
  const lines = [`Boards describing ${result.repo}:`];
  for (const board of result.boards) {
    const level = board.identity.level ? `, ${board.identity.level}` : '';
    lines.push(`  ${board.key} (${board.identity.variant}${level}, ${board.source})`);
    for (const node of board.nodes) {
      const kind = node.kind ? ` [${node.kind}]` : '';
      lines.push(`    ${node.name ?? node.node}${kind} -> ${node.path}`);
    }
  }
  if (result.unreadable.length > 0) {
    lines.push(`Could not read ${result.unreadable.length} note(s): ` +
      result.unreadable.map(entry => entry.file).join(', '));
  }
  return lines.join('\n');
}
