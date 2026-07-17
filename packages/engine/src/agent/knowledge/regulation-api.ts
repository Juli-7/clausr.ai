import type {
  GetRegulationRequest,
  GetRegulationResponse,
  GetClauseRequest,
  GetClauseResponse,
  GetClausesRequest,
  GetClausesResponse,
  GetRegulationMetaRequest,
  GetRegulationMetaResponse,
  ListRegulationsRequest,
  ListRegulationsResponse,
  SearchClausesRequest,
  SearchClausesResponse,
} from "./regulation-types";

export interface IRegulationApi {
  getRegulation(req: GetRegulationRequest): Promise<GetRegulationResponse>;
  getClause(req: GetClauseRequest): Promise<GetClauseResponse>;
  getClauses(req: GetClausesRequest): Promise<GetClausesResponse>;
  getRegulationMeta(req: GetRegulationMetaRequest): Promise<GetRegulationMetaResponse>;
  listRegulations(req: ListRegulationsRequest): Promise<ListRegulationsResponse>;
  searchClauses(req: SearchClausesRequest): Promise<SearchClausesResponse>;
  resolveCode(rawCode: string): Promise<string | null>;
  invalidateCache(): void;
}

/**
 * Factory to get the current RegulationApi implementation.
 * Switch between mock and real by changing the import here.
 */
let _instance: IRegulationApi | null = null;

export async function getRegulationApi(): Promise<IRegulationApi> {
  if (!_instance) {
    const { MockRegulationApi } = await import("./mock-regulation-api");
    _instance = new MockRegulationApi();
  }
  return _instance as IRegulationApi;
}

export function setRegulationApi(api: IRegulationApi): void {
  _instance = api;
}
