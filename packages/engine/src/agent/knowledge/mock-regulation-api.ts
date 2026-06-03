import Database from "better-sqlite3";
import path from "path";
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
import type { IRegulationApi } from "./regulation-api";

let _db: Database.Database | null = null;

const REG_DB_PATH = process.env.KB_DB_PATH ?? path.join(process.cwd(), "data", "kb.sqlite");

function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(REG_DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS regulations (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      jurisdiction TEXT NOT NULL,
      cross_references TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS code_aliases (
      alias TEXT PRIMARY KEY,
      code TEXT NOT NULL REFERENCES regulations(code)
    );

    CREATE TABLE IF NOT EXISTS regulation_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      version TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      changelog TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS clauses (
      id TEXT PRIMARY KEY,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      number TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      parent_clause_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clauses_regulation ON clauses(regulation_code);
    CREATE INDEX IF NOT EXISTS idx_versions_regulation ON regulation_versions(regulation_code);
  `);

  const { count } = _db.prepare("SELECT COUNT(*) as count FROM regulations").get() as { count: number };
  if (count === 0) {
    seedData(_db);
  }

  return _db;
}

function seedData(db: Database.Database): void {
  const regStmt = db.prepare(
    "INSERT INTO regulations (id, code, title, description, jurisdiction, cross_references) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const aliasStmt = db.prepare("INSERT OR IGNORE INTO code_aliases (alias, code) VALUES (?, ?)");
  const verStmt = db.prepare(
    "INSERT INTO regulation_versions (regulation_code, version, effective_date, is_current, changelog) VALUES (?, ?, ?, ?, ?)"
  );
  const clauseStmt = db.prepare(
    "INSERT INTO clauses (id, regulation_code, number, title, text, parent_clause_id) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    // R48 — Lighting
    regStmt.run("un-r48", "R48", "UN Regulation No. 48 — Lighting and Light-Signalling Devices", "Uniform provisions concerning the approval of vehicles with regard to the installation of lighting and light-signalling devices.", "UNECE", JSON.stringify(["R112", "R148", "R149"]));
    for (const a of ["R48", "r48", "UN R48", "UN-R48", "UNR48"]) aliasStmt.run(a, "R48");
    verStmt.run("R48", "06", "2019-01-01", 0, "Initial supplement 4 to 06 series");
    verStmt.run("R48", "07", "2023-01-01", 1, "07 series amendments — LED and adaptive driving beam provisions");
    clauseStmt.run("r48-5", "R48", "5", "General specifications", "All lighting and light-signalling devices shall be installed so that the vehicle complies with the requirements of this Regulation under normal conditions of use.", null);
    clauseStmt.run("r48-5.1", "R48", "5.1", "General", "Devices shall be securely fixed and shall not be affected by vibrations encountered in normal use.", null);
    clauseStmt.run("r48-5.2", "R48", "5.2", "Light source categories", "Replaceable light sources shall belong to an approved category listed in the relevant UN Regulation.", null);
    clauseStmt.run("r48-5.3", "R48", "5.3", "Electrical connections", "The electrical connections shall be such that no lighting device can be switched off individually by a manual control, except as otherwise permitted.", null);
    clauseStmt.run("r48-5.4", "R48", "5.4", "Colour of lights", "The colour of the light emitted by each device shall conform to the requirements specified in paragraph 2.17.", null);
    clauseStmt.run("r48-5.5", "R48", "5.5", "Number of lamps", "The number of lamps fitted to a vehicle shall be as specified for each lighting function.", null);
    clauseStmt.run("r48-5.6", "R48", "5.6", "Installation requirements", "Devices shall be installed so that they can be correctly adjusted and maintained.", null);
    clauseStmt.run("r48-5.7", "R48", "5.7", "Switching requirements", "The switching of lighting devices shall comply with the sequences specified in paragraph 2.12.", null);
    clauseStmt.run("r48-5.8", "R48", "5.8", "Tell-tales", "Each mandatory lamp shall be provided with an operating tell-tale.", null);
    clauseStmt.run("r48-5.9", "R48", "5.9", "Conformity of production", "Procedures for conformity of production shall comply with those set out in the Agreement, Appendix 2.", null);
    clauseStmt.run("r48-5.10", "R48", "5.10", "Vertical inclination", "The vertical inclination of the passing beam shall be set in accordance with the requirements of Annex 5.", null);
    clauseStmt.run("r48-5.11", "R48", "5.11", "Auto-leveling", "Vehicles equipped with LED headlamps or light sources exceeding a specified luminous flux shall be fitted with an automatic headlamp leveling device that maintains the correct beam inclination regardless of vehicle load.", null);
    clauseStmt.run("r48-5.12", "R48", "5.12", "Headlamp cleaning", "Headlamps with a light source having a luminous flux exceeding a specified threshold shall be equipped with a headlamp cleaning device.", null);
    clauseStmt.run("r48-6", "R48", "6", "Individual specifications", "The installation of each type of device shall conform to the requirements specified in the following paragraphs.", null);
    clauseStmt.run("r48-6.1", "R48", "6.1", "Headlamps — Mounting height", "The mounting height of headlamps shall be not less than 500 mm and not more than 1,200 mm above the ground for vehicles of category M1 and N1.", null);
    clauseStmt.run("r48-6.2", "R48", "6.2", "Headlamps — Number", "The number of headlamps shall be two for vehicles of a width exceeding 1,300 mm, and one for vehicles of a width not exceeding 1,300 mm.", null);
    clauseStmt.run("r48-6.3", "R48", "6.3", "Position lamps — Geometrical visibility", "The geometrical visibility of position lamps shall include the angles defined in paragraph 2.13 of this Regulation.", null);
    clauseStmt.run("r48-6.4", "R48", "6.4", "Stop lamps — Colour", "Stop lamps shall emit red light. The chromaticity coordinates shall conform to the boundaries specified in paragraph 2.17.1.", null);
    clauseStmt.run("r48-6.5", "R48", "6.5", "Direction indicator lamps — Electrical connections", "Direction indicator lamps shall flash. The electrical connections shall be such that the lamps cannot be switched off individually.", null);
    clauseStmt.run("r48-6.6", "R48", "6.6", "Rear fog lamps — Position", "The rear fog lamp shall be mounted on the centreline of the vehicle, or offset to the driver's side.", null);
    clauseStmt.run("r48-6.7", "R48", "6.7", "Daytime running lamps", "Daytime running lamps shall be installed in the front of the vehicle and shall switch off automatically when headlamps are activated.", null);
    clauseStmt.run("r48-6.8", "R48", "6.8", "Adaptive Driving Beam (ADB)", "ADB systems shall automatically adjust the beam pattern to avoid dazzling other road users while maintaining maximum illumination.", null);
    clauseStmt.run("r48-6.9", "R48", "6.9", "Rear registration plate illuminating device", "The rear registration plate shall be illuminated by a white light device that ensures readability at night.", null);
    clauseStmt.run("r48-6.10", "R48", "6.10", "Reversing lamps", "Reversing lamps shall be white and shall illuminate the area behind the vehicle.", null);
    clauseStmt.run("r48-6.11", "R48", "6.11", "End-outline marker lamps", "End-outline marker lamps shall be fitted to vehicles exceeding 2.10 m in width.", null);
    clauseStmt.run("r48-6.12", "R48", "6.12", "Side marker lamps", "Side marker lamps shall be fitted to vehicles exceeding 6 m in length.", null);

    // R112 — Headlamps
    regStmt.run("un-r112", "R112", "UN Regulation No. 112 — Headlamps Emitting an Asymmetrical Passing Beam", "Uniform provisions concerning the approval of motor vehicle headlamps emitting an asymmetrical passing beam or a driving beam or both.", "UNECE", JSON.stringify(["R48", "R148"]));
    for (const a of ["R112", "r112", "UN R112", "UN-R112", "UNR112"]) aliasStmt.run(a, "R112");
    verStmt.run("R112", "01", "2015-01-01", 0, "");
    verStmt.run("R112", "02", "2022-01-01", 1, "LED source provisions updated");
    clauseStmt.run("r112-5", "R112", "5", "General specifications", "Each headlamp shall be so manufactured as to conform to the specifications set out in this Regulation.", null);
    clauseStmt.run("r112-5.1", "R112", "5.1", "General — Markings", "Headlamps shall bear the applicant's trade name or mark and the designation 'HC' or 'HC/R'.", null);
    clauseStmt.run("r112-5.2", "R112", "5.2", "General — Materials", "Lenses shall be made of glass or plastic material that meets the requirements of this Regulation.", null);
    clauseStmt.run("r112-5.3", "R112", "5.3", "Cut-off angle", "The passing beam cut-off angle shall be such that the horizontal inclination does not exceed 0.57° when measured under the conditions specified in Annex 4.", null);
    clauseStmt.run("r112-5.4", "R112", "5.4", "Luminous flux", "Each headlamp shall produce a luminous flux of not less than 150 lumens when measured in accordance with the procedure described in Annex 3.", null);
    clauseStmt.run("r112-5.5", "R112", "5.5", "Colour temperature limits", "The colour temperature of the headlamp beam shall not exceed 6,000 K. The chromaticity coordinates of the light emitted shall lie within the boundaries specified in Annex 7.", null);
    clauseStmt.run("r112-6", "R112", "6", "Illumination specifications", "Headlamps shall meet the photometric requirements specified in Annex 3.", null);
    clauseStmt.run("r112-6.1", "R112", "6.1", "Passing beam — Cut-off", "The passing beam shall have a distinct cut-off line. The horizontal portion shall be at an angle of 0° to 0.5° below the horizontal plane.", null);
    clauseStmt.run("r112-6.2", "R112", "6.2", "Passing beam — Intensity", "The maximum intensity of the passing beam shall not exceed the values specified in Table 1 of Annex 3.", null);
    clauseStmt.run("r112-6.3", "R112", "6.3", "Driving beam — Intensity", "The driving beam shall produce a maximum luminous intensity of not less than the value specified in paragraph 6.3.1.", null);
    clauseStmt.run("r112-6.4", "R112", "6.4", "Colour temperature", "The colour temperature of the light source shall be between 2,800 K and 6,500 K. For LED sources, the chromaticity coordinates shall fall within the boundaries defined in Annex 7.", null);
    clauseStmt.run("r112-6.5", "R112", "6.5", "Beam pattern — Uniformity", "The illumination across the beam pattern shall be uniform, with no abrupt changes in intensity.", null);

    // GDPR — General Data Protection Regulation
    regStmt.run("eu-gdpr", "GDPR", "EU General Data Protection Regulation", "Regulation on the protection of natural persons with regard to the processing of personal data and on the free movement of such data.", "EU", JSON.stringify([]));
    for (const a of ["GDPR", "gdpr", "EU GDPR", "eu-gdpr"]) aliasStmt.run(a, "GDPR");
    verStmt.run("GDPR", "01", "2018-05-25", 1, "Initial application");
    clauseStmt.run("gdpr-art4-7", "GDPR", "Art 4(7)", "Controller", "Controller means the natural or legal person, public authority, agency or other body which, alone or jointly with others, determines the purposes and means of the processing of personal data.", null);
    clauseStmt.run("gdpr-art5", "GDPR", "Art 5", "Principles relating to processing of personal data", "Personal data shall be processed lawfully, fairly and in a transparent manner; collected for specified, explicit and legitimate purposes; adequate, relevant and limited to what is necessary; accurate and kept up to date; kept in a form which permits identification for no longer than necessary; processed in a manner that ensures appropriate security.", null);
    clauseStmt.run("gdpr-art5-1e", "GDPR", "Art 5(1)(e)", "Storage limitation", "Personal data shall be kept in a form which permits identification of data subjects for no longer than is necessary for the purposes for which the personal data are processed.", null);
    clauseStmt.run("gdpr-art6", "GDPR", "Art 6", "Lawfulness of processing", "Processing shall be lawful only if and to the extent that at least one of the following applies: consent of the data subject; performance of a contract; compliance with a legal obligation; protection of vital interests; performance of a task carried out in the public interest; or legitimate interests of the controller.", null);
    clauseStmt.run("gdpr-art6-1a", "GDPR", "Art 6(1)(a)", "Consent", "The data subject has given consent to the processing of his or her personal data for one or more specific purposes.", null);
    clauseStmt.run("gdpr-art6-1b", "GDPR", "Art 6(1)(b)", "Contract", "Processing is necessary for the performance of a contract to which the data subject is party.", null);
    clauseStmt.run("gdpr-art7", "GDPR", "Art 7", "Conditions for consent", "Where processing is based on consent, the controller shall be able to demonstrate that the data subject has consented to processing of his or her personal data. The request for consent shall be presented in a clear and plain language.", null);
    clauseStmt.run("gdpr-art7-4", "GDPR", "Art 7(4)", "Consent imbalance", "When assessing whether consent is freely given, utmost account shall be taken of whether the performance of a contract, including the provision of a service, is conditional on consent to the processing of personal data that is not necessary for the performance of that contract.", null);
    clauseStmt.run("gdpr-art9", "GDPR", "Art 9", "Processing of special categories of personal data", "Processing of personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership, and the processing of genetic data, biometric data for the purpose of uniquely identifying a natural person, data concerning health or data concerning a natural person's sex life or sexual orientation shall be prohibited.", null);
    clauseStmt.run("gdpr-art15", "GDPR", "Art 15", "Right of access by the data subject", "The data subject shall have the right to obtain from the controller confirmation as to whether or not personal data concerning him or her are being processed, and access to the personal data and certain information about the processing purposes, categories, recipients, retention periods, and safeguards.", null);
    clauseStmt.run("gdpr-art17", "GDPR", "Art 17", "Right to erasure (right to be forgotten)", "The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay where the personal data are no longer necessary, consent is withdrawn, or processing is unlawful.", null);
    clauseStmt.run("gdpr-art33-1", "GDPR", "Art 33(1)", "Notification of a personal data breach to the supervisory authority", "In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the supervisory authority.", null);
    clauseStmt.run("gdpr-art35", "GDPR", "Art 35", "Data protection impact assessment", "Where a type of processing in particular using new technologies is likely to result in a high risk to the rights and freedoms of natural persons, the controller shall, prior to the processing, carry out an assessment of the impact of the envisaged processing operations on the protection of personal data.", null);
    clauseStmt.run("gdpr-art35-3b", "GDPR", "Art 35(3)(b)", "DPIA mandatory", "A data protection impact assessment shall in particular be required for processing on a large scale of special categories of data referred to in Article 9.", null);
    clauseStmt.run("gdpr-art37", "GDPR", "Art 37", "Designation of the data protection officer", "The controller and the processor shall designate a data protection officer in any case where the processing is carried out by a public authority or body, or the core activities of the controller or processor consist of processing on a large scale of special categories of data.", null);
    clauseStmt.run("gdpr-art37-7", "GDPR", "Art 37(7)", "DPO contact details", "The data protection officer shall be designated on the basis of professional qualities and, in particular, expert knowledge of data protection law and practices. The controller or processor shall publish the contact details of the data protection officer and communicate them to the supervisory authority.", null);
    clauseStmt.run("gdpr-art44-49", "GDPR", "Art 44-49", "International transfers", "Any transfer of personal data which are undergoing processing or are intended for processing after transfer to a third country or to an international organisation shall take place only if, subject to the other provisions of this Regulation, the conditions laid down in Chapters V are complied with by the controller and processor, including for onward transfers of personal data from the third country or an international organisation to another third country or to another international organisation.", null);
    clauseStmt.run("gdpr-art46", "GDPR", "Art 46", "Transfers subject to appropriate safeguards", "Where there is no adequacy decision pursuant to Article 45, the controller or processor may transfer personal data to a third country or an international organisation only if the controller or processor has provided appropriate safeguards, and on condition that enforceable data subject rights and effective legal remedies for data subjects are available.", null);
    clauseStmt.run("gdpr-art32", "GDPR", "Art 32", "Security of processing", "The controller and processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including pseudonymisation, encryption, confidentiality, integrity, availability, and resilience of processing systems.", null);
  });

  seed();
}

function rowToRegulation(row: Record<string, unknown>, db: Database.Database): Regulation {
  const code = row.code as string;
  const versions = db.prepare("SELECT version, effective_date AS effectiveDate, is_current AS isCurrent, changelog FROM regulation_versions WHERE regulation_code = ? ORDER BY id ASC").all(code) as Regulation["versions"];
  const clauses = db.prepare("SELECT id, number, title, text, parent_clause_id AS parentClauseId FROM clauses WHERE regulation_code = ? ORDER BY number ASC").all(code) as Clause[];
  return {
    id: row.id as string,
    code,
    title: row.title as string,
    description: row.description as string,
    jurisdiction: row.jurisdiction as string,
    versions: versions.map((v) => ({ ...v, isCurrent: Boolean(v.isCurrent) })),
    clauses,
    crossReferences: JSON.parse(row.cross_references as string),
  };
}

export class MockRegulationApi implements IRegulationApi {
  resolveCode(rawCode: string): string | null {
    const db = getDb();
    const row = db.prepare("SELECT code FROM code_aliases WHERE alias = ?").get(rawCode) as { code: string } | undefined;
    return row?.code ?? null;
  }

  async getRegulation(req: GetRegulationRequest): Promise<GetRegulationResponse> {
    try {
      const code = this.resolveCode(req.code);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.code}` };

      const db = getDb();
      const row = db.prepare("SELECT * FROM regulations WHERE code = ?").get(code) as Record<string, unknown> | undefined;
      if (!row) return { success: false, error: `Regulation ${code} not found` };

      const regulation = rowToRegulation(row, db);

      if (req.version) {
        const exists = regulation.versions.some((v) => v.version === req.version);
        if (!exists) return { success: false, error: `Version ${req.version} not found for regulation ${code}` };
      }

      return { success: true, data: regulation };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getClause(req: GetClauseRequest): Promise<GetClauseResponse> {
    try {
      const code = this.resolveCode(req.regulationCode);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.regulationCode}` };

      const db = getDb();
      const row = db.prepare("SELECT id, number, title, text, parent_clause_id AS parentClauseId FROM clauses WHERE regulation_code = ? AND number = ?").get(code, req.clauseNumber) as Clause | undefined;
      if (!row) return { success: false, error: `Clause ${req.clauseNumber} not found in regulation ${code}` };

      return { success: true, data: row, regulationCode: code };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async listRegulations(req: ListRegulationsRequest): Promise<ListRegulationsResponse> {
    try {
      const db = getDb();
      let query = "SELECT * FROM regulations WHERE 1=1";
      const params: unknown[] = [];

      if (req.jurisdiction) {
        query += " AND jurisdiction = ?";
        params.push(req.jurisdiction);
      }

      if (req.keyword) {
        query += " AND (title LIKE ? OR description LIKE ? OR code LIKE ?)";
        const kw = `%${req.keyword}%`;
        params.push(kw, kw, kw);
      }

      const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
      const data = rows.map((r) => rowToRegulation(r, db));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async searchClauses(req: SearchClausesRequest): Promise<SearchClausesResponse> {
    try {
      const db = getDb();
      const kw = `%${req.keyword}%`;

      let query = "SELECT c.*, c.regulation_code AS regulationCode FROM clauses c WHERE (c.title LIKE ? OR c.text LIKE ? OR c.number LIKE ?)";
      const params: unknown[] = [kw, kw, kw];

      if (req.regulationCodes && req.regulationCodes.length > 0) {
        const codes = req.regulationCodes.map((c) => this.resolveCode(c)).filter(Boolean) as string[];
        if (codes.length > 0) {
          query += ` AND c.regulation_code IN (${codes.map(() => "?").join(",")})`;
          params.push(...codes);
        }
      }

      const rows = db.prepare(query).all(...params) as (Clause & { regulationCode: string })[];
      const data = rows.map((r) => ({ clause: { id: r.id, number: r.number, title: r.title, text: r.text, parentClauseId: r.parentClauseId } as Clause, regulationCode: r.regulationCode }));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  invalidateCache(): void {
    if (_db) {
      _db.close();
      _db = null;
    }
  }
}
