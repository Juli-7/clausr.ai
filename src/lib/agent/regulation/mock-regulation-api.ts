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
import { RegulationSchema } from "./regulation-types";
import type { IRegulationApi } from "./regulation-api";

// ── Mock data ──

const MOCK_REGULATIONS: Regulation[] = [
  {
    id: "un-r48",
    code: "R48",
    title: "UN Regulation No. 48 — Lighting and Light-Signalling Devices",
    description: "Uniform provisions concerning the approval of vehicles with regard to the installation of lighting and light-signalling devices.",
    jurisdiction: "UNECE",
    versions: [
      { version: "06", effectiveDate: "2019-01-01", isCurrent: false, changelog: "Initial supplement 4 to 06 series" },
      { version: "07", effectiveDate: "2023-01-01", isCurrent: true, changelog: "07 series amendments — LED and adaptive driving beam provisions" },
    ],
    clauses: [
      { id: "r48-5", number: "5", title: "General specifications", text: "All lighting and light-signalling devices shall be installed so that the vehicle complies with the requirements of this Regulation under normal conditions of use." },
      { id: "r48-5.1", number: "5.1", title: "General", text: "Devices shall be securely fixed and shall not be affected by vibrations encountered in normal use." },
      { id: "r48-6", number: "6", title: "Individual specifications", text: "The installation of each type of device shall conform to the requirements specified in the following paragraphs." },
      { id: "r48-6.1", number: "6.1", title: "Headlamps — Mounting height", text: "The mounting height of headlamps shall be not less than 500 mm and not more than 1,200 mm above the ground for vehicles of category M1 and N1." },
      { id: "r48-6.2", number: "6.2", title: "Headlamps — Number", text: "The number of headlamps shall be two for vehicles of a width exceeding 1,300 mm, and one for vehicles of a width not exceeding 1,300 mm." },
      { id: "r48-6.3", number: "6.3", title: "Position lamps — Geometrical visibility", text: "The geometrical visibility of position lamps shall include the angles defined in paragraph 2.13 of this Regulation." },
      { id: "r48-6.4", number: "6.4", title: "Stop lamps — Colour", text: "Stop lamps shall emit red light. The chromaticity coordinates shall conform to the boundaries specified in paragraph 2.17.1." },
      { id: "r48-6.5", number: "6.5", title: "Direction indicator lamps — Electrical connections", text: "Direction indicator lamps shall flash. The electrical connections shall be such that the lamps cannot be switched off individually." },
      { id: "r48-6.6", number: "6.6", title: "Rear fog lamps — Position", text: "The rear fog lamp shall be mounted on the centreline of the vehicle, or offset to the driver's side." },
      { id: "r48-6.7", number: "6.7", title: "Daytime running lamps", text: "Daytime running lamps shall be installed in the front of the vehicle and shall switch off automatically when headlamps are activated." },
      { id: "r48-6.8", number: "6.8", title: "Adaptive Driving Beam (ADB)", text: "ADB systems shall automatically adjust the beam pattern to avoid dazzling other road users while maintaining maximum illumination." },
      { id: "r48-6.9", number: "6.9", title: "Rear registration plate illuminating device", text: "The rear registration plate shall be illuminated by a white light device that ensures readability at night." },
      { id: "r48-6.10", number: "6.10", title: "Reversing lamps", text: "Reversing lamps shall be white and shall illuminate the area behind the vehicle." },
      { id: "r48-6.11", number: "6.11", title: "End-outline marker lamps", text: "End-outline marker lamps shall be fitted to vehicles exceeding 2.10 m in width." },
      { id: "r48-6.12", number: "6.12", title: "Side marker lamps", text: "Side marker lamps shall be fitted to vehicles exceeding 6 m in length." },
    ],
    crossReferences: ["R112", "R148", "R149"],
  },
  {
    id: "un-r112",
    code: "R112",
    title: "UN Regulation No. 112 — Headlamps Emitting an Asymmetrical Passing Beam",
    description: "Uniform provisions concerning the approval of motor vehicle headlamps emitting an asymmetrical passing beam or a driving beam or both.",
    jurisdiction: "UNECE",
    versions: [
      { version: "01", effectiveDate: "2015-01-01", isCurrent: false },
      { version: "02", effectiveDate: "2022-01-01", isCurrent: true, changelog: "LED source provisions updated" },
    ],
    clauses: [
      { id: "r112-5", number: "5", title: "General specifications", text: "Each headlamp shall be so manufactured as to conform to the specifications set out in this Regulation." },
      { id: "r112-5.1", number: "5.1", title: "General — Markings", text: "Headlamps shall bear the applicant's trade name or mark and the designation 'HC' or 'HC/R'." },
      { id: "r112-5.2", number: "5.2", title: "General — Materials", text: "Lenses shall be made of glass or plastic material that meets the requirements of this Regulation." },
      { id: "r112-6", number: "6", title: "Illumination specifications", text: "Headlamps shall meet the photometric requirements specified in Annex 3." },
      { id: "r112-6.1", number: "6.1", title: "Passing beam — Cut-off", text: "The passing beam shall have a distinct cut-off line. The horizontal portion shall be at an angle of 0° to 0.5° below the horizontal plane." },
      { id: "r112-6.2", number: "6.2", title: "Passing beam — Intensity", text: "The maximum intensity of the passing beam shall not exceed the values specified in Table 1 of Annex 3." },
      { id: "r112-6.3", number: "6.3", title: "Driving beam — Intensity", text: "The driving beam shall produce a maximum luminous intensity of not less than the value specified in paragraph 6.3.1." },
      { id: "r112-6.4", number: "6.4", title: "Colour temperature", text: "The colour temperature of the light source shall be between 2,800 K and 6,500 K. For LED sources, the chromaticity coordinates shall fall within the boundaries defined in Annex 7." },
      { id: "r112-6.5", number: "6.5", title: "Beam pattern — Uniformity", text: "The illumination across the beam pattern shall be uniform, with no abrupt changes in intensity." },
    ],
    crossReferences: ["R48", "R148"],
  },
  {
    id: "un-r83",
    code: "R83",
    title: "UN Regulation No. 83 — Emission of Pollutants",
    description: "Uniform provisions concerning the approval of vehicles with regard to the emission of pollutants according to engine fuel requirements.",
    jurisdiction: "UNECE",
    versions: [
      { version: "07", effectiveDate: "2017-01-01", isCurrent: false },
      { version: "08", effectiveDate: "2023-01-01", isCurrent: true, changelog: "WLTP test cycle integration" },
    ],
    clauses: [
      { id: "r83-5", number: "5", title: "Application for approval", text: "The application for approval shall be submitted by the vehicle manufacturer." },
      { id: "r83-5.1", number: "5.1", title: "Application — Test vehicle", text: "A vehicle representative of the type to be approved shall be submitted to the technical service." },
      { id: "r83-5.2", number: "5.2", title: "Application — Documentation", text: "The application shall include a description of the engine, fuel system, and emission control devices." },
      { id: "r83-5.3", number: "5.3", title: "OBD system documentation", text: "Documentation describing the OBD system architecture, monitored components, and malfunction indicators." },
      { id: "r83-6", number: "6", title: "Specifications and tests", text: "The vehicle shall be tested according to the procedures described in Annex 4." },
      { id: "r83-6.1", number: "6.1", title: "Exhaust emissions — Type I test", text: "The Type I test shall measure CO, HC, NOx, and PM emissions over the applicable driving cycle." },
      { id: "r83-6.2", number: "6.2", title: "Exhaust emissions — Type III test", text: "The Type III test (crankcase emissions) shall verify that no crankcase gases are discharged to the atmosphere." },
      { id: "r83-6.3", number: "6.3", title: "Evaporative emissions — Type IV test", text: "The Type IV test shall measure hydrocarbon emissions from the fuel system." },
      { id: "r83-6.4", number: "6.4", title: "Durability — Type V test", text: "The durability test shall verify that emission limits are maintained over the vehicle's useful life." },
      { id: "r83-6.5", number: "6.5", title: "OBD system", text: "The OBD system shall detect malfunctions in emission-related components and illuminate the MIL." },
    ],
    crossReferences: ["R49", "R96"],
  },
  {
    id: "un-r154",
    code: "R154",
    title: "UN Regulation No. 154 — WLTP Emissions",
    description: "Uniform provisions concerning the approval of M1, N1 and M2 vehicles with regard to WLTP emissions.",
    jurisdiction: "UNECE",
    versions: [
      { version: "00", effectiveDate: "2020-01-01", isCurrent: false },
      { version: "01", effectiveDate: "2024-01-01", isCurrent: true, changelog: "Supplement 2 — RDE provisions" },
    ],
    clauses: [
      { id: "r154-5", number: "5", title: "Application for approval", text: "The application for approval of a vehicle type with regard to WLTP emissions shall be submitted by the manufacturer." },
      { id: "r154-6", number: "6", title: "WLTP test procedure", text: "The WLTP test shall be conducted according to the procedures specified in Annex 1." },
      { id: "r154-6.1", number: "6.1", title: "WLTP — Vehicle preparation", text: "The test vehicle shall be preconditioned according to the procedures in Annex 1, paragraph 2." },
      { id: "r154-6.2", number: "6.2", title: "WLTP — Dynamometer settings", text: "Road load coefficients shall be determined according to Annex 4." },
      { id: "r154-6.3", number: "6.3", title: "WLTP — Test cycle", text: "The applicable WLTC cycle shall be determined based on the vehicle's power-to-mass ratio and maximum speed." },
    ],
    crossReferences: ["R83"],
  },
  {
    id: "un-r13",
    code: "R13",
    title: "UN Regulation No. 13 — Braking",
    description: "Uniform provisions concerning the approval of vehicles of categories M, N and O with regard to braking.",
    jurisdiction: "UNECE",
    versions: [
      { version: "11", effectiveDate: "2018-01-01", isCurrent: false },
      { version: "12", effectiveDate: "2023-01-01", isCurrent: true, changelog: "AEBS and ESC provisions" },
    ],
    clauses: [
      { id: "r13-5", number: "5", title: "Application for approval", text: "The application for approval shall be submitted by the vehicle manufacturer or authorized representative." },
      { id: "r13-5.1", number: "5.1", title: "Braking system description", text: "The application shall include a detailed description of the service, secondary, and parking braking systems." },
      { id: "r13-5.2", number: "5.2", title: "ABS documentation", text: "If equipped with ABS, documentation describing the system architecture and performance characteristics." },
      { id: "r13-6", number: "6", title: "Braking performance", text: "The vehicle shall meet the braking performance requirements specified in Annex 3." },
      { id: "r13-6.1", number: "6.1", title: "Service braking — Type 0 test", text: "The Type 0 test shall verify braking performance with cold brakes at the prescribed test speed." },
      { id: "r13-6.2", number: "6.2", title: "Service braking — Type I test", text: "The Type I test (fade test) shall verify braking performance after repeated applications." },
      { id: "r13-6.3", number: "6.3", title: "Parking braking", text: "The parking brake shall hold the vehicle stationary on a 20% gradient, both laden and unladen." },
      { id: "r13-6.4", number: "6.4", title: "ABS performance", text: "ABS-equipped vehicles shall meet the adhesion utilization and wheel lock requirements." },
    ],
    crossReferences: ["R13H", "R79"],
  },
];

// ── Code resolution map ──

const CODE_ALIASES: Record<string, string> = {
  "R48": "R48", "r48": "R48", "UN R48": "R48", "UN-R48": "R48", "UNR48": "R48",
  "R112": "R112", "r112": "R112", "UN R112": "R112", "UN-R112": "R112", "UNR112": "R112",
  "R83": "R83", "r83": "R83", "UN R83": "R83", "UN-R83": "R83", "UNR83": "R83",
  "R154": "R154", "r154": "R154", "UN R154": "R154", "UN-R154": "R154", "UNR154": "R154",
  "R13": "R13", "r13": "R13", "UN R13": "R13", "UN-R13": "R13", "UNR13": "R13",
};

// ── Mock implementation ──

export class MockRegulationApi implements IRegulationApi {
  private cache = new Map<string, Regulation>();
  private clauseCache = new Map<string, Clause>();

  constructor() {
    for (const reg of MOCK_REGULATIONS) {
      this.cache.set(reg.code, reg);
      for (const clause of reg.clauses) {
        this.clauseCache.set(`${reg.code}:${clause.number}`, clause);
      }
    }
  }

  async getRegulation(req: GetRegulationRequest): Promise<GetRegulationResponse> {
    try {
      const code = this.resolveCode(req.code);
      if (!code) {
        return { success: false, error: `Unknown regulation code: ${req.code}` };
      }

      const regulation = this.cache.get(code);
      if (!regulation) {
        return { success: false, error: `Regulation ${code} not found in mock database` };
      }

      // Validate before returning
      const validated = RegulationSchema.safeParse(regulation);
      if (!validated.success) {
        return { success: false, error: `Invalid regulation data: ${validated.error.message}` };
      }

      // Version filtering (mock: just check if version exists)
      if (req.version) {
        const versionExists = regulation.versions.some((v) => v.version === req.version);
        if (!versionExists) {
          return { success: false, error: `Version ${req.version} not found for regulation ${code}` };
        }
      }

      return { success: true, data: regulation };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getClause(req: GetClauseRequest): Promise<GetClauseResponse> {
    try {
      const code = this.resolveCode(req.regulationCode);
      if (!code) {
        return { success: false, error: `Unknown regulation code: ${req.regulationCode}` };
      }

      const key = `${code}:${req.clauseNumber}`;
      const clause = this.clauseCache.get(key);
      if (!clause) {
        return { success: false, error: `Clause ${req.clauseNumber} not found in regulation ${code}` };
      }

      return { success: true, data: clause, regulationCode: code };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async listRegulations(req: ListRegulationsRequest): Promise<ListRegulationsResponse> {
    try {
      let results = [...this.cache.values()];

      if (req.jurisdiction) {
        results = results.filter((r) => r.jurisdiction === req.jurisdiction);
      }

      if (req.keyword) {
        const kw = req.keyword.toLowerCase();
        results = results.filter(
          (r) =>
            r.title.toLowerCase().includes(kw) ||
            r.description.toLowerCase().includes(kw) ||
            r.code.toLowerCase().includes(kw)
        );
      }

      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async searchClauses(req: SearchClausesRequest): Promise<SearchClausesResponse> {
    try {
      const results: { clause: Clause; regulationCode: string }[] = [];
      const regulations = req.regulationCodes
        ? req.regulationCodes.map((c) => this.resolveCode(c)).filter(Boolean) as string[]
        : [...this.cache.keys()];

      const kw = req.keyword.toLowerCase();

      for (const code of regulations) {
        const reg = this.cache.get(code);
        if (!reg) continue;

        for (const clause of reg.clauses) {
          if (
            clause.title.toLowerCase().includes(kw) ||
            clause.text.toLowerCase().includes(kw) ||
            clause.number.includes(kw)
          ) {
            results.push({ clause, regulationCode: code });
          }
        }
      }

      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  resolveCode(rawCode: string): string | null {
    return CODE_ALIASES[rawCode] ?? null;
  }

  invalidateCache(): void {
    this.cache.clear();
    this.clauseCache.clear();
    for (const reg of MOCK_REGULATIONS) {
      this.cache.set(reg.code, reg);
      for (const clause of reg.clauses) {
        this.clauseCache.set(`${reg.code}:${clause.number}`, clause);
      }
    }
  }
}
