import { useCallback, type ComponentProps, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArchitectureReadError,
	architectureModelKeys,
	architectureModelQuery,
} from "#ui/clients/architecture-model/queries.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ModelHeader, ModelError } from "#ui/components/architecture-model/ModelFrame.tsx";
import { ModelReading } from "#ui/components/architecture-model/ModelReading.tsx";
import { ModelPreviewStateEvidence } from "#ui/components/architecture-model/ModelPreviewStateEvidence.tsx";
import { ModelPreviewSelector } from "#ui/components/architecture-model/ModelPreviewSelector.tsx";
import { ModelPreviewCoverage } from "#ui/components/architecture-model/ModelPreviewCoverage.tsx";
import { ModelPreviewDetails } from "#ui/components/architecture-model/ModelPreviewDetails.tsx";

type PreviewProps = Pick<
	ComponentProps<typeof ModelReading>,
	"vault" | "paneId" | "reducedMotion" | "onCodeTargetNotice"
>;

/**
 * Read a saved migration candidate without subscribing to canonical live authority.
 * @param props The existing pane and its source vault.
 * @returns A preview with explicit provenance or a recoverable refusal.
 */
function ModelPreviewReader(props: PreviewProps): JSX.Element {
	const location = useModelLocation(props.paneId);
	const query = useQuery(
		architectureModelQuery(props.vault, location.checkpoint, {
			preview: location.preview,
			state: location.state,
			against: location.against,
		}),
	);
	const client = useQueryClient();
	const { vault } = props;
	const refresh = useCallback((): void => {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
	}, [client, vault]);
	const model = query.isError ? undefined : query.data;
	const problem = previewProblem(query.error, model?.manifest.id, location.model);
	return (
		<section
			data-slot="architecture-model-stage"
			data-preview={location.preview}
			data-state={previewState(query.isPending, problem)}
			aria-busy={query.isFetching}
			aria-label="Migration preview"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader
				name={`Migration preview · ${location.preview}`}
				refresh={refresh}
				refreshing={query.isFetching}
			>
				<ModelPreviewSelector
					preview={query.data?.migrationPreview}
					state={location.state}
					onState={location.selectState}
				/>
			</ModelHeader>
			{query.isPending && (
				<output className="text-body text-muted-foreground p-10">Reading migration preview…</output>
			)}
			{problem === null ? (
				<PreviewContent {...props} model={model} subject={location.subject} />
			) : (
				<ModelError {...problem} />
			)}
		</section>
	);
}

/**
 * Keep the preview's loading and refusal states explicit.
 * @param pending Whether the first read is pending.
 * @param problem The current refusal, or absence.
 * @returns The visible state of this reader.
 */
function previewState(pending: boolean, problem: ComponentProps<typeof ModelError> | null): string {
	if (pending) return "loading";
	return problem === null ? "ready" : "error";
}

/**
 * Reject a failed refresh or mismatched identity without exposing cached candidate content.
 * @param error The selected query refusal.
 * @param actual The coherent model identity, if available.
 * @param requested The pane's explicit model identity.
 * @returns One visible problem, or permission to show the candidate.
 */
function previewProblem(
	error: Error | null,
	actual: string | undefined,
	requested: string | null,
): ComponentProps<typeof ModelError> | null {
	if (error instanceof ArchitectureReadError)
		return {
			code: error.failure.code,
			message: error.message,
			diagnostics: error.failure.diagnostics,
		};
	if (error !== null) return { code: "READ_FAILED", message: error.message };
	if (actual !== undefined && requested !== null && actual !== requested)
		return {
			code: "MODEL_NOT_FOUND",
			message: `This plan previews model ${actual}, not ${requested}. Open the preview with its model identity.`,
		};
	return null;
}

/**
 * Reuse ordinary model navigation only after a coherent preview arrives.
 * @param props The pane, candidate, and explicit selected subject.
 * @returns The preview evidence and model reading, or nothing during loading.
 */
function PreviewContent(
	props: PreviewProps & {
		model: ComponentProps<typeof ModelReading>["model"] | undefined;
		subject: string | null;
	},
): JSX.Element | null {
	if (props.model === undefined) return null;
	return (
		<>
			<ModelPreviewCoverage model={props.model} />
			<ModelPreviewStateEvidence model={props.model} />
			<ModelPreviewDetails model={props.model} />
			<ModelReading
				{...props}
				key={JSON.stringify([props.model.manifest.id, props.subject])}
				model={props.model}
			/>
		</>
	);
}

export { ModelPreviewReader };
