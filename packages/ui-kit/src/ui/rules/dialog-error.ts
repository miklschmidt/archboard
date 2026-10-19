// The one failure shape every dialog surface in the browser reports.

/**
 * A failure the host reports into a dialog. It stays visible until the host
 * clears it, because a dialog that loses its error loses the reason to retry.
 */
interface DialogError {
	title: string;
	message: string;
}

export type { DialogError };
