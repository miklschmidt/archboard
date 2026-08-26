// State that has to outlive a module reload.
//
// `bun --hot` re-evaluates a changed module inside the running process instead
// of restarting it, so module scope is rebuilt and anything reachable from
// `globalThis` is not. The canvas holds work that exists nowhere else: boards
// nobody has saved yet, the panes a human arranged on the wall, the change
// feed's baselines and cursors. Dropping that on a file save would cost more
// than any reload is worth (ADR 0014), so it is parked here rather than in
// module scope.
//
// Keyed by name, not by module binding, because after a reload some modules
// have been re-evaluated and some have not, and the name is the only identity
// the two halves still agree on. Every version of every module asking for
// `boards` gets the one Map.
//
// Under `canvas start`, which never reloads, this is a lazily created
// singleton and nothing more.
//
// What belongs here: anything a browser tab, an open board or a cursor would
// miss. What does not: derived caches that cost nothing to rebuild, and
// anything holding a reference to a class from a particular module version.

const REGISTRY = Symbol.for("archboard.kept");

type Registry = Map<string, unknown>;

function registry(): Registry {
	const host = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
	if (!host[REGISTRY]) host[REGISTRY] = new Map();
	return host[REGISTRY];
}

/**
 * The one instance of `name` in this process, created on first ask.
 *
 * `create` runs at most once however many times the module around it is
 * re-evaluated. Anything that must not run twice — binding a port, registering
 * a signal handler — belongs inside it, or behind a flag kept alongside it.
 */
export function kept<T>(name: string, create: () => T): T {
	const store = registry();
	if (!store.has(name)) store.set(name, create());
	return store.get(name) as T;
}
