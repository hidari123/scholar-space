/**
 * slides 客户端 —— 由契约生成，不要手改。
 *
 * 契约：slides.yaml
 *
 * ⚠️ **改了会被下次生成覆盖** —— 要定制行为，改生成器。
 */
import { type RequestOptions, request } from "../core/api-client";
/** CreateProjectRequest —— 由契约生成，不要手改。 */
export type CreateProjectRequest = {
	title: string;
	sourceType?: "paper" | "pdf" | "markdown" | "topic";
	sourceRef?: string;
	lang?: string;
	themeId?: string;
	canvasRatio?: "16:9" | "4:3" | "A4";
};
/** ProjectResponse —— 由契约生成，不要手改。 */
export type ProjectResponse = {
	projectId: string;
	ownerId: number;
	title: string;
	sourceType: string;
	sourceRef?: string;
	lang: string;
	themeId: string;
	canvasRatio: string;
	status:
		| "draft"
		| "planning"
		| "planned"
		| "rendering"
		| "rendered"
		| "failed";
	pageCount: number;
	createdAt?: string | null;
	updatedAt?: string | null;
};
/** PageResponse —— 由契约生成，不要手改。 */
export type PageResponse = {
	pageId: string;
	orderNo: number;
	layout:
		| "title"
		| "bullets"
		| "section"
		| "two_column"
		| "image_focus"
		| "image_left"
		| "chart"
		| "table"
		| "quote";
	title: string;
	bullets: string[];
	imageRefs: string[];
	notes: string;
	overflow: "shrink" | "truncate" | "split" | "regenerate";
	layoutWarnings: string[];
};
/** PlanResponse —— 由契约生成，不要手改。 */
export type PlanResponse = {
	themeId: string;
	version: number;
	pageCount: number;
	pages: PageResponse[];
	model?: string | null;
};
/** RenderRequest —— 由契约生成，不要手改。 */
export type RenderRequest = {
	pageIds?: string[];
	zoom?: number;
};
/** RenderResponse —— 由契约生成，不要手改。 */
export type RenderResponse = {
	pageCount: number;
	pptxPath: string;
	previewDir: string;
	previewPaths: string[];
};
/** ExportRequest —— 由契约生成，不要手改。 */
export type ExportRequest = {
	format?: "pptx" | "pdf" | "png_zip" | "md";
};
/** ExportResponse —— 由契约生成，不要手改。 */
export type ExportResponse = {
	format: string;
	path: string;
	sizeBytes: number;
	pageCount: number;
};
/** 列出项目 */
export async function listSlideProjects(
	options?: RequestOptions,
): Promise<ProjectResponse[]> {
	return request<ProjectResponse[]>(`/v1/slides/projects`, {
		method: "GET",
		...options,
	});
}
/** 创建项目 */
export async function createSlideProject(
	body: CreateProjectRequest,
	options?: RequestOptions,
): Promise<ProjectResponse> {
	return request<ProjectResponse>(`/v1/slides/projects`, {
		method: "POST",
		body,
		...options,
	});
}
/** 取项目 */
export async function getSlideProject(
	projectId: string,
	options?: RequestOptions,
): Promise<ProjectResponse> {
	return request<ProjectResponse>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 删除项目（幂等） */
export async function deleteSlideProject(
	projectId: string,
	options?: RequestOptions,
): Promise<unknown> {
	return request<unknown>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}`,
		{
			method: "DELETE",
			...options,
		},
	);
}
/** 取大纲 */
export async function getSlidePlan(
	projectId: string,
	options?: RequestOptions,
): Promise<PlanResponse> {
	return request<PlanResponse>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}/plan`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 生成大纲 */
export async function planSlideProject(
	projectId: string,
	options?: RequestOptions,
): Promise<PlanResponse> {
	return request<PlanResponse>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}/plan`,
		{
			method: "POST",
			...options,
		},
	);
}
/** 渲染（PPTX + PNG 预览） */
export async function renderSlideProject(
	projectId: string,
	body: RenderRequest,
	options?: RequestOptions,
): Promise<RenderResponse> {
	return request<RenderResponse>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}/render`,
		{
			method: "POST",
			body,
			...options,
		},
	);
}
/** 导出 */
export async function exportSlideProject(
	projectId: string,
	body: ExportRequest,
	options?: RequestOptions,
): Promise<ExportResponse> {
	return request<ExportResponse>(
		`/v1/slides/projects/${encodeURIComponent(projectId)}/export`,
		{
			method: "POST",
			body,
			...options,
		},
	);
}
