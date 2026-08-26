// Confirmation for the one action that destroys work.
//
// The bar's Clear used to fire straight into a DELETE of every element, while
// the CLI has always demanded --yes for the same thing. This is the missing
// half. It is built to survive a stray touch on a wall-mounted panel: the
// cancel is what focus lands on, Escape and a tap anywhere outside cancel,
// and the destructive control is a deliberate distance away from all of them.

import React from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
	title: string;
	detail: React.ReactNode;
	confirmLabel: string;
	busy?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	title,
	detail,
	confirmLabel,
	busy,
	onConfirm,
	onCancel,
}: ConfirmDialogProps): React.JSX.Element {
	return (
		<Modal
			title={title}
			onCancel={onCancel}
			footer={
				<>
					<button
						className="btn btn-quiet btn-big"
						data-autofocus
						onClick={onCancel}
						disabled={busy}
					>
						Cancel
					</button>
					<button className="btn btn-danger btn-big" onClick={onConfirm} disabled={busy}>
						{busy ? "Working…" : confirmLabel}
					</button>
				</>
			}
		>
			{detail}
		</Modal>
	);
}
