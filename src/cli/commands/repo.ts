import path from 'path';
import { parseArgs, CliUsageError } from '../args.js';
import { printJson, note } from '../util.js';
import {
  declareRepo,
  forgetRepo,
  listRepos,
  registryPath,
  RepoRegistryError
} from '../../core/repo-registry.js';

// repo: the checkouts on this machine, and their identities.
//
// A binding names a repository and a path inside it, never a directory on one
// laptop, because the vault it is stored in spans repositories and is meant to
// be readable from any of them (ADR 0004). Something still has to know where
// `github.com/acme/payments` is *here*, and this is where that is written down
// (ADR 0011).
//
// Registering a repo is what makes cross-repo work possible without moving:
// once a checkout is registered, `promote --repo github.com/acme/payments
// --path src/service.ts` resolves from anywhere, so a system board covering
// five repositories can be built in one session without a single `cd`.
//
// Nothing here talks to the canvas. The registry is a machine-local file, so
// these run whether or not a server is up.

export const SUBCOMMANDS = ['list', 'add', 'forget'] as const;

const USAGE = 'Usage: repo list [--text] | repo add [dir] | repo forget <identity>';

export async function repo(argv: string[]): Promise<void> {
  const action = argv[0]?.startsWith('--') ? undefined : argv[0];
  const rest = action === undefined ? argv : argv.slice(1);

  if (action === 'add') return repoAdd(rest);
  if (action === 'forget') return repoForget(rest);
  if (action === undefined || action === 'list') return repoList(rest);

  throw new CliUsageError(USAGE);
}

async function repoList(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv, { text: { takesValue: false } });
  const repos = listRepos();

  if (flags.text) {
    if (repos.length === 0) {
      process.stdout.write(
        'No repository is registered on this machine yet.\n' +
        'Run `repo add` inside a checkout, or bind with absolute paths and archboard will learn as it goes.\n'
      );
      return;
    }
    const lines = repos.map(entry =>
      `${entry.repo}\n  ${entry.root}${entry.exists ? '' : '  (gone)'}  [${entry.source}]`
    );
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  printJson({ success: true, registry: registryPath(), repos });
}

async function repoAdd(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv, {});
  // The directory is the one thing a person can point at; the identity is
  // git's to decide, because two people naming the same clone differently is
  // what would make the address space useless.
  const dir = path.resolve(positionals[0] ?? process.cwd());

  let entry;
  try {
    entry = declareRepo(dir);
  } catch (error) {
    if (error instanceof RepoRegistryError) throw new CliUsageError(error.message);
    throw error;
  }

  note(
    `"${entry.repo}" is now resolvable from anywhere on this machine: ` +
    `promote --repo ${entry.repo} --path <path inside it>.`
  );
  printJson({ success: true, ...entry, registry: registryPath() });
}

async function repoForget(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv, {});
  const identity = positionals[0];
  if (!identity) throw new CliUsageError('repo forget needs a repository identity, e.g. github.com/acme/payments');

  const forgotten = forgetRepo(identity);
  if (!forgotten) {
    const known = listRepos().map(entry => entry.repo);
    note(
      `"${identity}" was not registered, so nothing changed.` +
      (known.length ? ` Registered here: ${known.join(', ')}.` : '')
    );
  } else {
    note(
      `Forgot where "${identity}" is checked out. Bindings that already name it keep their address; ` +
      'they just have nothing to resolve to until it is registered again.'
    );
  }
  printJson({ success: true, repo: identity, forgotten, registry: registryPath() });
}
