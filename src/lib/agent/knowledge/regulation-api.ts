import type {
  Regulation,
  Clause,
  GetRegulationRequest,
  GetRegulationResponse,
  GetClauseRequest,
  GetClauseResponse,
  ListRegulationsRequest,
  ListRegulationsResponse,
  SearchClausesRequest,
  SearchClausesResponse,
} from "./regulation-types";

/**
 * Interface for the Regulation API.
 * 
 * Currently implemented by MockRegulationApi for development.
 * Future: replace with RealRegulationApi that calls structured DB backend.
 */
export interface IRegulationApi {
  /**
   * Get a full regulation by code (and optional version).
   */
  getRegulation(req: GetRegulationRequest): Promise<GetRegulationResponse>;

  /**
   * Get a single clause from a regulation.
   */
  getClause(req: GetClauseRequest): Promise<GetClauseResponse>;

  /**
   * List available regulations, optionally filtered by jurisdiction or keyword.
   */
  listRegulations(req: ListRegulationsRequest): Promise<ListRegulationsResponse>;

  /**
   * Search clauses across regulations by keyword.
   */
  searchClauses(req: SearchClausesRequest): Promise<SearchClausesResponse>;

  /**
   * Resolve a regulation code to its canonical form.
   * e.g. "R48" → "R48", "r48" → "R48", "UN R48" → "R48"
   */
  resolveCode(rawCode: string): string | null;

  /**
   * Invalidate internal caches (useful after data updates).
   */
  invalidateCache(): void;
}

/**
 * Factory to get the current RegulationApi implementation.
 * Switch between mock and real by changing the import here.
 */
let _instance: IRegulationApi | null = null;

export function getRegulationApi(): IRegulationApi {
  if (!_instance) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MockRegulationApi } = require("./mock-regulation-api");
    _instance = new MockRegulationApi();
  }
  return _instance as IRegulationApi;
}

export function setRegulationApi(api: IRegulationApi): void {
  _instance = api;
}
