import { useCallback, useMemo, type ComponentProps, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArchitectureReadError,
	architectureModelKeys,
	architectureModelQuery,
} from "#ui/clients/architecture-model/queries.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ModelHeader, ModelError } from "#ui/components/architecture-model/ModelFrame.tsx";
import { ModelReading } from "#ui/components/architecture-model/ModelReading.tsx";
import { ModelPreviewOriginals } from "#ui/components/architecture-model/ModelPreviewOriginals.tsx";
import { ModelPreviewStateEvidence } from "#ui/components/architecture-model/ModelPreviewStateEvidence.tsx";
import { ModelPreviewSelector } from "#ui/components/architecture-model/ModelPreviewSelector.tsx";
import { ModelPreviewCoverage } from "#ui/components/architecture-model/ModelPreviewCoverage.tsx";
import { ModelPreviewDetails } from "#ui/components/architecture-model/ModelPreviewDetails.tsx";
import { ModelBookmarks } from "#ui/components/architecture-model/ModelBookmarks.tsx";
import { ModelBookmarkReading } from "#ui/components/architecture-model/ModelBookmarkReading.tsx";
import {
	ModelWalkthroughReader,
	ModelWalkthroughFrame,
} from "#ui/components/architecture-model/ModelWalkthroughReader.tsx";
import { ModelLegacyAddresses } from "#ui/components/architecture-model/ModelLegacyAddresses.tsx";

type PreviewProps = Pick<
	ComponentProps<typeof ModelReading>,
	"vault" | "paneId" | "reducedMotion" | "onCodeTargetNotice"
> &
	Pick<ComponentProps<typeof ModelWalkthroughReader>, "driven" | "narration" | "overlay">;

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
			bookmark: location.bookmark,
			legacyAddress: location.legacyAddress,
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
	const preview = model?.migrationPreview;
	const header = useMemo(
		() => (
			<ModelHeader
				name={`Migration preview · ${location.preview}`}
				refresh={refresh}
				refreshing={query.isFetching}
			>
				<ModelPreviewSelector
					preview={preview}
					pending={query.isPending}
					state={previewOriginal(preview, location.state)}
					onState={location.selectState}
				/>
				<ModelBookmarks
					catalogue={preview}
					selected={location.bookmark}
					pending={query.isPending}
					onSelect={location.selectBookmark}
				/>
				<ModelLegacyAddresses
					catalogue={preview}
					selected={location.legacyAddress}
					pending={query.isPending}
					onSelect={location.selectLegacyAddress}
				/>
			</ModelHeader>
		),
		[
			location.preview,
			preview,
			query.isFetching,
			query.isPending,
			location.state,
			location.selectState,
			location.bookmark,
			location.selectBookmark,
			location.legacyAddress,
			location.selectLegacyAddress,
			refresh,
		],
	);
	const content = (
		<>
			{query.isPending && (
				<output className="text-body text-muted-foreground p-10">Reading migration preview…</output>
			)}
			{problem === null ? (
				<PreviewContent {...props} model={model} subject={location.subject} />
			) : (
				<ModelError {...problem} />
			)}
		</>
	);
	return (
		<section
			data-slot="architecture-model-stage"
			data-preview={location.preview}
			data-state={previewState(query.isPending, problem)}
			aria-busy={query.isFetching}
			aria-label="Migration preview"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelWalkthroughFrame
				key={previewReadingKey(model)}
				{...props}
				model={model}
				refused={problem !== null}
				chrome={header}
			>
				{content}
			</ModelWalkthroughFrame>
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
			<ModelPreviewOriginals model={props.model} />
			<PreviewModel {...props} model={props.model} />
		</>
	);
}

export { ModelPreviewReader };

/**
 * Retained originals remain readable even when they cannot compose architecture.
 * @param props The coherent response and existing reader inputs.
 * @returns A complete candidate or an explicit conversion refusal beside its originals.
 */
function PreviewModel(
	props: PreviewProps & {
		model: ComponentProps<typeof ModelReading>["model"];
		subject: string | null;
	},
): JSX.Element {
	const diagnostics = props.model.migrationPreview?.diagnostics;
	if (diagnostics !== undefined && diagnostics.length > 0)
		return (
			<div data-slot="preview-originals-only" className="min-h-0 flex-1 overflow-auto">
				<ModelError
					code="MAPPING_UNRESOLVED"
					message="These retained originals cannot form a complete model. Inspect the original files and resolve the reported source or mapping problems before migration."
					diagnostics={diagnostics}
				/>
			</div>
		);
	return <PreviewReading {...props} />;
}

/**
 * Captured presentations and imported bookmarks share the ordinary reader.
 * @param props The coherent original architecture and pane.
 * @returns A readable bookmark or explicit unavailable view.
 */
function PreviewReading(
	props: PreviewProps & Pick<ComponentProps<typeof ModelReading>, "model" | "subject">,
): JSX.Element {
	const bookmark = props.model.migrationPreview?.bookmark;
	return (
		<ModelBookmarkReading model={props.model}>
			<ModelReading {...props} key={JSON.stringify([props.subject, bookmark?.id])} />
		</ModelBookmarkReading>
	);
}

/**
 * A new source selection starts a new presentation, while refresh keeps its capture.
 * @param model The complete selected preview.
 * @returns The source identity of the presentation session.
 */
function previewReadingKey(
	model: ComponentProps<typeof ModelReading>["model"] | undefined,
): string {
	return JSON.stringify([
		model?.manifest.id,
		previewOriginal(model?.migrationPreview, null),
		model?.checkpoint?.id,
	]);
}

/**
 * A former address identifies the exact original selected by the runtime.
 * @param preview The resolved original coverage.
 * @param requested An explicit original state, including unavailable intent.
 * @returns The resolved original identity or the unchanged request.
 */
function previewOriginal(
	preview: ComponentProps<typeof ModelReading>["model"]["migrationPreview"],
	requested: string | null,
): string | null {
	return preview?.selected?.legacy ?? requested;
}
