import { useCallback, useState } from "react";

/**
 * What a reader folded in a list, and the way to fold or open one more. Everything stands open
 * until the reader folds it, and nothing is kept past the list's life.
 * @returns The folded keys, and the fold that turns one.
 */
function useFolds<Key>(): {
	readonly folded: ReadonlySet<Key>;
	readonly fold: (key: Key) => void;
} {
	const [folded, setFolded] = useState<ReadonlySet<Key>>(() => new Set());
	const fold = useCallback((key: Key): void => {
		setFolded((now) => {
			const next = new Set(now);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}, []);
	return { folded, fold };
}

export { useFolds };
