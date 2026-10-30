import { useCallback, useState, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@archboard/ui-kit/components";
import { architectureModelKeys } from "#ui/clients/architecture-model/queries.ts";
import {
	architecturePublicationQuery,
	changeArchitecturePublication,
	type Destination,
	type PublicationCommand,
	type Publication,
} from "#ui/clients/architecture-model/publication.ts";
import { PublicationDestination } from "#ui/components/architecture-model/PublicationDestination.tsx";
import {
	PublicationDetails,
	publicationLabel,
} from "#ui/components/architecture-model/PublicationDetails.tsx";

interface ModelPublicationProps {
	vault: string;
	checkpoint: string;
}

/**
 * Sharing status belongs to the selected exact reading, independently of its cached architecture.
 * @param props The explicitly selected checkpoint and vault.
 * @returns Explicit publication and recovery controls with local evidence.
 */
function ModelPublication(props: ModelPublicationProps): JSX.Element {
	const { vault, checkpoint } = props;
	const query = useQuery(architecturePublicationQuery(vault, checkpoint));
	const client = useQueryClient();
	const [editing, setEditing] = useState(false);
	const operation = useMutation({
		/**
		 * Apply the action with its captured target.
		 * @param command The reader's explicit request.
		 * @returns Its durable publication outcome.
		 */
		mutationFn: (command: PublicationCommand) => changeArchitecturePublication(vault, command),
		/**
		 * Close destination entry only after accepted configuration.
		 * @param result The shared outcome.
		 * @param command The original intent.
		 */
		onSuccess: (result, command) => {
			if (result.success && command.action === "configure") setEditing(false);
		},
		/**
		 * Refresh local status and exact-reading metadata after any attempted exchange.
		 * @returns The refreshed active model queries.
		 */
		onSettled: () => client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) }),
	});
	const { mutate, reset } = operation;
	const configure = useCallback(
		(destination: Destination): void => mutate({ action: "configure", input: destination }),
		[mutate],
	);
	const edit = useCallback((): void => {
		reset();
		setEditing(true);
	}, [reset]);
	const cancel = useCallback((): void => setEditing(false), []);
	if (query.isPending)
		return (
			<output className="text-body text-muted-foreground px-6 py-3">Reading sharing status…</output>
		);
	if (query.isError)
		return (
			<output role="alert" className="text-body px-6 py-3">
				{query.error.message}
			</output>
		);
	const status = query.data;
	return (
		<section
			data-slot="model-publication"
			data-publication={status.publication}
			aria-label="History publication"
			className="border-border border-b px-6 py-3"
		>
			<PublicationHeader
				status={status}
				checkpoint={checkpoint}
				pending={operation.isPending}
				onConfigure={edit}
				onExchange={mutate}
			/>
			{editing && (
				<PublicationDestination
					destination={status.destination}
					pending={operation.isPending}
					onSave={configure}
					onCancel={cancel}
				/>
			)}
			<PublicationDetails status={status} attempt={operation.data ?? status} />
			{operation.isError && (
				<p role="alert" className="text-body mt-3">
					{operation.error.message}
				</p>
			)}
		</section>
	);
}

interface PublicationHeaderProps {
	status: Publication;
	checkpoint: string;
	pending: boolean;
	onConfigure: () => void;
	onExchange: (command: PublicationCommand) => void;
}

/**
 * The status row shows the explicit destination beside its available action.
 * @param props The publication evidence and controls for this reading.
 * @returns The status, destination, and explicit exchange controls.
 */
function PublicationHeader(props: PublicationHeaderProps): JSX.Element {
	const { status, checkpoint, pending, onConfigure, onExchange } = props;
	return (
		<div className="flex items-center gap-4">
			<span className="text-control font-semibold">
				{status.publication === undefined
					? "Sharing status unavailable"
					: publicationLabel[status.publication]}
			</span>
			{status.destination !== undefined && (
				<span className="text-body text-muted-foreground min-w-0 truncate">
					{status.destination.remote} · {status.destination.ref}
				</span>
			)}
			<div className="ml-auto flex shrink-0 gap-2">
				<Button
					variant="ghost"
					size="sm"
					data-slot="publication-destination-toggle"
					onClick={onConfigure}
					disabled={pending}
				>
					Set sharing destination
				</Button>
				{status.destination !== undefined && status.publication !== undefined && (
					<PublicationExchange
						destination={status.destination}
						checkpoint={checkpoint}
						unavailable={status.publication === "unavailable"}
						retry={status.publication === "publication-pending"}
						pending={pending}
						onExchange={onExchange}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * Each exchange captures the exact checkpoint and configured destination.
 * @param props The displayed reading and mutation progress.
 * @param props.destination The configured remote and ref.
 * @param props.checkpoint The immutable reading identity.
 * @param props.unavailable Whether local architecture needs recovery.
 * @param props.pending Whether an explicit action is underway.
 * @param props.retry Whether the prior publication needs another attempt.
 * @param props.onExchange Sends the captured intent.
 * @returns Publish or fetch, without an implicit remote operation.
 */
function PublicationExchange(props: {
	destination: Destination;
	checkpoint: string;
	unavailable: boolean;
	pending: boolean;
	retry: boolean;
	onExchange: (command: PublicationCommand) => void;
}): JSX.Element {
	const { destination, checkpoint, unavailable, onExchange } = props;
	const exchange = useCallback(
		(): void =>
			onExchange({
				action: unavailable ? "fetch" : "publish",
				input: { ...destination, checkpoint },
			}),
		[destination, checkpoint, unavailable, onExchange],
	);
	return (
		<Button
			size="sm"
			variant="outline"
			data-slot={unavailable ? "publication-fetch" : "publication-publish"}
			onClick={exchange}
			disabled={props.pending}
			aria-busy={props.pending}
		>
			{props.pending
				? "Working…"
				: unavailable
					? "Fetch this reading"
					: props.retry
						? "Retry publication"
						: "Publish history"}
		</Button>
	);
}

export { ModelPublication };
