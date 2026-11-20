/**
 * orchestra 客户端 —— 由契约生成，不要手改。
 *
 * 契约：orchestra.yaml
 *
 * ⚠️ **改了会被下次生成覆盖** —— 要定制行为，改生成器。
 */
import { type RequestOptions, request } from "../core/api-client";
/** CreateFlowRequest —— 由契约生成，不要手改。 */
export type CreateFlowRequest = {
	name: string;
	description?: string;
	nodes?: NodeSpec[];
	edges?: EdgeSpec[];
};
/** NodeSpec —— 由契约生成，不要手改。 */
export type NodeSpec = {
	nodeId: string;
	nodeType: string;
	config?: Record<string, unknown>;
};
/** EdgeSpec —— 由契约生成，不要手改。 */
export type EdgeSpec = {
	fromNode: string;
	toNode: string;
	condition?: string;
};
/** FlowResponse —— 由契约生成，不要手改。 */
export type FlowResponse = {
	flowId: string;
	name: string;
	description?: string;
	version: number;
	status: "draft" | "active" | "archived";
	nodes: NodeSpec[];
	edges: EdgeSpec[];
	createdAt?: string | null;
	updatedAt?: string | null;
};
/** CreateRunRequest —— 由契约生成，不要手改。 */
export type CreateRunRequest = {
	flowId: string;
	inputs?: Record<string, unknown>;
};
/** RunResponse —— 由契约生成，不要手改。 */
export type RunResponse = {
	runId: string;
	flowId: string;
	status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
	outputs?: Record<string, unknown>;
	error?: string | null;
	failedNodeId?: string | null;
	createdAt: string;
	startedAt?: string | null;
	finishedAt?: string | null;
};
/** CreateSessionRequest —— 由契约生成，不要手改。 */
export type CreateSessionRequest = {
	flowId: string;
	title?: string;
};
/** AppendMessageRequest —— 由契约生成，不要手改。 */
export type AppendMessageRequest = {
	content: string;
	role?: "user" | "assistant" | "system" | "tool";
};
/** SessionResponse —— 由契约生成，不要手改。 */
export type SessionResponse = {
	sessionId: string;
	flowId: string;
	title?: string;
	messages: SessionMessage[];
	createdAt: string;
	updatedAt?: string | null;
};
/** SessionMessage —— 由契约生成，不要手改。 */
export type SessionMessage = {
	role: "user" | "assistant" | "system" | "tool";
	content: string;
	createdAt?: string | null;
};
/** NodeSpecResponse —— 由契约生成，不要手改。 */
export type NodeSpecResponse = {
	nodeType: string;
	category: string;
	displayName: string;
	description?: string;
	icon?: string;
	ports?: PortSpec[];
};
/** PortSpec —— 由契约生成，不要手改。 */
export type PortSpec = {
	name: string;
	portType: string;
	required?: boolean;
};
/** 列出流程 */
export async function listFlows(
	options?: RequestOptions,
): Promise<FlowResponse[]> {
	return request<FlowResponse[]>(`/v1/orchestra/flows`, {
		method: "GET",
		...options,
	});
}
/** 创建流程 */
export async function createFlow(
	body: CreateFlowRequest,
	options?: RequestOptions,
): Promise<FlowResponse> {
	return request<FlowResponse>(`/v1/orchestra/flows`, {
		method: "POST",
		body,
		...options,
	});
}
/** 取流程 */
export async function getFlow(
	flowId: string,
	options?: RequestOptions,
): Promise<FlowResponse> {
	return request<FlowResponse>(
		`/v1/orchestra/flows/${encodeURIComponent(flowId)}`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 删除流程（幂等） */
export async function deleteFlow(
	flowId: string,
	options?: RequestOptions,
): Promise<unknown> {
	return request<unknown>(`/v1/orchestra/flows/${encodeURIComponent(flowId)}`, {
		method: "DELETE",
		...options,
	});
}
/** 列出运行 */
export async function listRuns(
	options?: RequestOptions,
): Promise<RunResponse[]> {
	return request<RunResponse[]>(`/v1/orchestra/runs`, {
		method: "GET",
		...options,
	});
}
/** 触发运行 */
export async function createRun(
	body: CreateRunRequest,
	options?: RequestOptions,
): Promise<unknown> {
	return request<unknown>(`/v1/orchestra/runs`, {
		method: "POST",
		body,
		...options,
	});
}
/** 取运行 */
export async function getRun(
	runId: string,
	options?: RequestOptions,
): Promise<RunResponse> {
	return request<RunResponse>(
		`/v1/orchestra/runs/${encodeURIComponent(runId)}`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 取消运行 */
export async function cancelRun(
	runId: string,
	options?: RequestOptions,
): Promise<RunResponse> {
	return request<RunResponse>(
		`/v1/orchestra/runs/${encodeURIComponent(runId)}/cancel`,
		{
			method: "POST",
			...options,
		},
	);
}
/** 订阅运行事件（SSE） */
export async function streamRunEvents(
	runId: string,
	options?: RequestOptions,
): Promise<unknown> {
	return request<unknown>(
		`/v1/orchestra/runs/${encodeURIComponent(runId)}/events`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 创建会话 */
export async function createSession(
	body: CreateSessionRequest,
	options?: RequestOptions,
): Promise<SessionResponse> {
	return request<SessionResponse>(`/v1/orchestra/sessions`, {
		method: "POST",
		body,
		...options,
	});
}
/** 取会话 */
export async function getSession(
	sessionId: string,
	options?: RequestOptions,
): Promise<SessionResponse> {
	return request<SessionResponse>(
		`/v1/orchestra/sessions/${encodeURIComponent(sessionId)}`,
		{
			method: "GET",
			...options,
		},
	);
}
/** 追加消息 */
export async function appendSessionMessage(
	sessionId: string,
	body: AppendMessageRequest,
	options?: RequestOptions,
): Promise<SessionResponse> {
	return request<SessionResponse>(
		`/v1/orchestra/sessions/${encodeURIComponent(sessionId)}/messages`,
		{
			method: "POST",
			body,
			...options,
		},
	);
}
/** 列出可用节点 */
export async function listNodes(
	options?: RequestOptions,
): Promise<NodeSpecResponse[]> {
	return request<NodeSpecResponse[]>(`/v1/orchestra/nodes`, {
		method: "GET",
		...options,
	});
}
/** 列出节点分类 */
export async function listNodeCategories(
	options?: RequestOptions,
): Promise<string[]> {
	return request<string[]>(`/v1/orchestra/nodes/categories`, {
		method: "GET",
		...options,
	});
}
