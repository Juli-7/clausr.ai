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
    throw new Error(
      "No RegulationApi registered. Call setRegulationApi() before getRegulationApi(). " +
      "In raipple-saas this is done via syncEngineConfig()."
    );
  }
  return _instance;
}

export function setRegulationApi(api: IRegulationApi): void {
  _instance = api;
}
