import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// The little bit of git archboard needs: what repository a directory belongs
// to, and what that repository is called in a way that is the same on every
// machine.
//
// Split out of promote.ts because two things need it now: resolving a binding,
// and keeping the checkout registry (ADR 0011). The registry cannot import
// promotion without a cycle.

export function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}

// Turn a git remote URL into a stable identity: host/owner/name, with the
// scheme, credentials, and .git suffix stripped so ssh and https clones of the
// same repo produce the same string.
export function repoIdentityFromRemote(remote: string): string {
  let url = remote.trim().replace(/\.git$/, '');
  url = url.replace(/^[a-z+]+:\/\//i, '');
  url = url.replace(/^[^@/]+@/, '');   // user@ / token@
  url = url.replace(':', '/');          // scp-style git@host:owner/name
  return url.replace(/\/+$/, '');
}

// Deepest existing directory at or above `p`. A binding may legitimately name
// a file that does not exist yet (a proposal), and we still want the repo.
export function existingDir(p: string): string | undefined {
  let dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
  for (let i = 0; i < 64; i++) {
    if (fs.existsSync(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/** The git root a path sits in, walking up from the deepest directory that exists. */
export function repoRootOf(anyPath: string): string | undefined {
  const searchDir = existingDir(path.resolve(anyPath));
  return searchDir ? git(searchDir, ['rev-parse', '--show-toplevel']) : undefined;
}

/**
 * What a checkout calls itself.
 *
 * `origin` when there is one, because that is the name the same repository has
 * on every machine and in every clone. A repo with no remote falls back to the
 * directory name, which is machine-local and therefore weaker. A binding that
 * says which local repo it means still beats one that says nothing.
 */
export function repoIdentityAt(root: string): string {
  const remote = git(root, ['remote', 'get-url', 'origin']);
  return remote ? repoIdentityFromRemote(remote) : path.basename(root);
}
