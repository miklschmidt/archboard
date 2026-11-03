// Which components React rendered, read the way React's own developer tools read
// it: a hook React finds on the global object when it loads, told of every commit.
//
// Import this before anything that imports React's DOM renderer, or React loads
// without it and nothing is watched.

/** A fiber, as far as the watch walks one. */
interface Fiber {
	readonly tag: number;
	readonly flags: number;
	readonly type: unknown;
	readonly child: Fiber | null;
	readonly sibling: Fiber | null;
	readonly alternate: Fiber | null;
}

/** The tags of the fibers a component renders: function, class, forward ref, memo, simple memo. */
const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);

/** The flag React sets on a fiber that rendered in this commit. */
const PERFORMED_WORK = 1;

/** The names rendered while a watch is open, or null while none is. */
let open: string[] | null = null;

/**
 * What a component is called.
 * @param type The fiber's type.
 * @returns Its name, or "?" when it has none.
 */
function nameOf(type: unknown): string {
	if (typeof type === "function") return type.name || "?";
	if (typeof type === "object" && type !== null) {
		const inner =
			(type as { render?: unknown; type?: unknown }).render ?? (type as { type?: unknown }).type;
		return nameOf(inner);
	}
	return "?";
}

/**
 * Whether a fiber is a component that rendered in this commit: mounted, or did work.
 * @param fiber The fiber.
 * @returns True when it did.
 */
function rendered(fiber: Fiber): boolean {
	return (
		COMPONENT_TAGS.has(fiber.tag) &&
		(fiber.alternate === null || (fiber.flags & PERFORMED_WORK) !== 0)
	);
}

/**
 * Whether React went below a fiber in this commit. A subtree that bailed out
 * keeps the children it had, which did nothing.
 * @param fiber The fiber.
 * @returns True when its children are new.
 */
function wentBelow(fiber: Fiber): boolean {
	return fiber.child !== null && fiber.child !== fiber.alternate?.child;
}

/**
 * Note every component that rendered in a committed tree.
 * @param root The first fiber below the committed root.
 * @param names Where the names go.
 */
function noteRendered(root: Fiber, names: string[]): void {
	const stack = [root];
	for (let fiber = stack.pop(); fiber !== undefined; fiber = stack.pop()) {
		if (rendered(fiber)) names.push(nameOf(fiber.type));
		if (fiber.sibling !== null) stack.push(fiber.sibling);
		if (wentBelow(fiber)) stack.push(fiber.child!);
	}
}

/** A no-op, for the hook's notifications the watch does not need. */
function ignore(): void {
	// The watch reads commits only.
}

Object.defineProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
	configurable: true,
	value: {
		renderers: new Map(),
		supportsFiber: true,
		isDisabled: false,
		checkDCE: ignore,
		onScheduleFiberRoot: ignore,
		onCommitFiberUnmount: ignore,
		onPostCommitFiberRoot: ignore,
		setStrictMode: ignore,
		/**
		 * React announcing itself.
		 * @returns The id it is known by.
		 */
		inject: () => 1,
		/**
		 * A commit, noted while a watch is open.
		 * @param _id The renderer.
		 * @param root The committed root.
		 * @param root.current Its committed tree.
		 */
		onCommitFiberRoot: (_id: number, root: { readonly current: Fiber }) => {
			const { child, alternate } = root.current;
			if (open !== null && child !== null && child !== alternate?.child) noteRendered(child, open);
		},
	},
});

/**
 * The components that rendered while something ran.
 * @param run What to run.
 * @returns Their names, once per render.
 */
function rendersDuring(run: () => void): string[] {
	open = [];
	try {
		run();
		return open;
	} finally {
		open = null;
	}
}

export { rendersDuring };
