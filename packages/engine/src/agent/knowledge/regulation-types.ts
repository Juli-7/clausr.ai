import { z } from "zod";

// ── Core types ──

export interface Clause {
  id: string;
  number: string;
  title: string;
  text: string;
  parentClauseId?: string;
}

export interface RegulationVersion {
  version: string;
  effectiveDate: string;
  isCurrent: boolean;
  changelog?: string;
}

export interface Regulation {
  id: string;
  code: string;
  title: string;
  description: string;
  jurisdiction: string;
  versions: RegulationVersion[];
  clauses: Clause[];
  crossReferences?: string[];
  metadata?: Record<string, string>;
}

// ── API request/response types ──

export interface GetRegulationRequest {
  code: string;
  version?: string;
}

export interface GetRegulationResponse {
  success: boolean;
  data?: Regulation;
  error?: string;
}

export interface GetClauseRequest {
  regulationCode: string;
  clauseNumber: string;
  version?: string;
}

export interface GetClauseResponse {
  success: boolean;
  data?: Clause;
  regulationCode?: string;
  error?: string;
}

export interface ListRegulationsRequest {
  jurisdiction?: string;
  keyword?: string;
}

export interface ListRegulationsResponse {
  success: boolean;
  data?: Regulation[];
  error?: string;
}

export interface SearchClausesRequest {
  regulationCodes?: string[];
  keyword: string;
  version?: string;
}

export interface SearchClausesResponse {
  success: boolean;
  data?: { clause: Clause; regulationCode: string }[];
  error?: string;
}

// ── Validation schemas ──

export const ClauseSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  title: z.string(),
  text: z.string().min(1),
  parentClauseId: z.string().optional(),
});

export const RegulationVersionSchema = z.object({
  version: z.string().min(1),
  effectiveDate: z.string(),
  isCurrent: z.boolean(),
  changelog: z.string().optional(),
});

export const RegulationSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  jurisdiction: z.string().min(1),
  versions: z.array(RegulationVersionSchema),
  clauses: z.array(ClauseSchema),
  crossReferences: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type ValidatedRegulation = z.infer<typeof RegulationSchema>;
export type ValidatedClause = z.infer<typeof ClauseSchema>;
