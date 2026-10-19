// Which key a platform uses as its command modifier, for shortcuts and the
// words that name them.

/**
 * Whether this platform uses the Command key where others use Control.
 * @returns True on Apple platforms.
 */
function usesCommandKey(): boolean {
	return /Mac|iPhone|iPad|iPod/u.test(globalThis.navigator.platform);
}

export { usesCommandKey };
