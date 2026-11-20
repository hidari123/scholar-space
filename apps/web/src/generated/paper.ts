/**
 * paper 客户端 —— 由契约生成，不要手改。
 *
 * 契约：paper.yaml
 *
 * ⚠️ **改了会被下次生成覆盖** —— 要定制行为，改生成器。
 */
import { type RequestOptions, request } from '../core/api-client';
/** SearchRequest —— 由契约生成，不要手改。 */
export type SearchRequest = {
  query?: string;
  author?: string;
  venue?: string;
  keywords?: string[];
  dateFrom?: number | null;
  dateTo?: number | null;
  openAccessOnly?: boolean;
  limit?: number;
  offset?: number;
  includeExternal?: boolean;
};
/** AuthorResponse —— 由契约生成，不要手改。 */
export type AuthorResponse = {
  authorId: string;
  name: string;
  orcid: string;
  institutions: string[];
};
/** PaperResponse —— 由契约生成，不要手改。 */
export type PaperResponse = {
  paperId: string;
  title: string;
  abstract: string;
  authors: AuthorResponse[];
  year: number | null;
  publicationType: 'journal_article' | 'conference_paper' | 'preprint' | 'thesis' | 'book' | 'report' | 'unknown';
  openAccess: 'open' | 'green' | 'hybrid' | 'closed' | 'embargo' | 'unknown';
  venue: string;
  volume: string;
  issue: string;
  pages: string;
  doi?: string | null;
  arxivId?: string | null;
  publisher: string;
  citationCount: number;
  citedByCount: number;
  keywords: string[];
  source: 'arxiv' | 'pubmed' | 'crossref' | 'semantic_scholar' | 'openalex' | 'local_upload' | 'manual';
  sourceId: string;
  pdfUrl: string;
  status: 'imported' | 'parsing' | 'parsed' | 'indexed' | 'failed';
  hasFullText: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};
/** ImportRequest —— 由契约生成，不要手改。 */
export type ImportRequest = {
  source: string;
  query?: string;
  limit?: number;
};
/** ImportReportResponse —— 由契约生成，不要手改。 */
export type ImportReportResponse = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  details: string[];
};
/** DedupDecisionResponse —— 由契约生成，不要手改。 */
export type DedupDecisionResponse = {
  isSame: boolean;
  reason: string;
  confidence: number;
};
/** 检索论文 */
export async function searchPapers(body: SearchRequest, options?: RequestOptions): Promise<PaperResponse[]> {
  return request<PaperResponse[]>(`/v1/papers/search`, {
    method: 'POST',
    body,
    ...options,
  });
}
/** 从数据源导入 */
export async function importPapers(body: ImportRequest, options?: RequestOptions): Promise<ImportReportResponse> {
  return request<ImportReportResponse>(`/v1/papers/import`, {
    method: 'POST',
    body,
    ...options,
  });
}
/** 取论文 */
export async function getPaper(paperId: string, options?: RequestOptions): Promise<PaperResponse> {
  return request<PaperResponse>(`/v1/papers/${encodeURIComponent(paperId)}`, {
    method: 'GET',
    ...options,
  });
}
/** 删除论文（幂等） */
export async function deletePaper(paperId: string, options?: RequestOptions): Promise<unknown> {
  return request<unknown>(`/v1/papers/${encodeURIComponent(paperId)}`, {
    method: 'DELETE',
    ...options,
  });
}
/** 取全文 */
export async function getPaperFullText(paperId: string, options?: RequestOptions): Promise<unknown> {
  return request<unknown>(`/v1/papers/${encodeURIComponent(paperId)}/full-text`, {
    method: 'GET',
    ...options,
  });
}
/** 检查两篇是不是重复 */
export async function checkPaperDuplicate(paperId: string, candidateId: string, options?: RequestOptions): Promise<DedupDecisionResponse> {
  return request<DedupDecisionResponse>(`/v1/papers/${encodeURIComponent(paperId)}/duplicate/${encodeURIComponent(candidateId)}`, {
    method: 'GET',
    ...options,
  });
}
