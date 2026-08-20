import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAuth, requireRole, AuthError } from "@clausr/platform-core";
import { listPacks, loadPack } from "@clausr/engine";
import type { SkillPack } from "@clausr/engine";
import { resolveLabel } from "@/lib/compliance/i18n";
import { logger } from "@/lib/logger";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");

const MARKETPLACE_PACK_IDS = new Set<string>([
  "datasec-gb44464",
  "datasec-gdpr",
  "eu-md-doc",
  "eu-mdr",
  "eu-atex",
  "eu-emc",
  "eu-lvd",
  "eu-rohs",
  "eu-weee",
  "eu-ecodesign",
  "eu-ppwr",
  "eu-md-manual",
  "infosec-iso27001",
]);

function getDefaultVisibility(packId: string): "author" | "org" | "marketplace" {
  return MARKETPLACE_PACK_IDS.has(packId) ? "marketplace" : "author";
}

function canReadPack(user: any, packId: string, visibility: string, author: string, visibleToOrgIds?: string[]): boolean {
  if (user.platformRole === "superadmin") return true;
  if (author === user.email) return true;
  if (visibility === "marketplace") return true;
  if (visibility === "org") {
    if (visibleToOrgIds && visibleToOrgIds.length > 0) {
      return user.memberships.some((m: any) => visibleToOrgIds.includes(m.organizationId));
    }
    return false;
  }
  return false;
}

type Visibility = "author" | "org" | "marketplace";

interface FieldBody {
  field: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "boolean" | "select";
  required: boolean;
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; maxLength?: number };
}

interface DocBody {
  type: string;
  title: string;
  template?: string;
  fields: FieldBody[];
}

interface CheckBody {
  id: string;
  field: string;
  type: "number" | "boolean" | "narrative" | "string" | "enum";
  description: string;
  clause?: string;
  constraint?: string;
  rounding?: number;
  depends_on?: string[];
  sample?: string;
}

interface ExpertBody {
  name: string;
  contact?: string;
  intro?: string;
}

interface CreatePackBody {
  title: string;
  description: string;
  industries: string[];
  regulation_ids: string[];
  triggers: string[];
  icon?: string;
  methodology?: string;
  documents: DocBody[];
  redlines?: string[];
  lessons?: string[];
  checks?: CheckBody[];
  checkPreview?: "compact" | "full";
  expert?: ExpertBody;
  visibility?: Visibility;
  visibleToOrgIds?: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function generateId(title: string, existingIds: Set<string>): string {
  let id = slugify(title);
  if (!id) id = "untitled-pack";
  if (!existingIds.has(id)) return id;
  let n = 2;
  while (existingIds.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? undefined;
  const regulation = searchParams.get("reg") ?? undefined;
  const industry = searchParams.get("industry") ?? undefined;

  const packNames = listPacks();
  const allPacks = packNames
    .map((name) => {
      const pack = loadPack(name);
      if (!pack) return null;
      let author = "";
      let checkPreview: "compact" | "full" = "full";
      let expert: Record<string, unknown> | undefined;
      let visibility: Visibility = "author";
      let visibleToOrgIds: string[] = [];
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, name, "pack.json"), "utf-8"));
        author = raw?.pack?.author ?? "";
        checkPreview = raw?.pack?.checkPreview ?? "full";
        expert = raw?.pack?.expert;
        visibility = raw?.pack?.visibility ?? getDefaultVisibility(name);
        visibleToOrgIds = raw?.pack?.visibleToOrgIds ?? [];
      } catch (err) {
        logger.warn("[packs] failed to read pack metadata", { name, error: (err as Error).message });
      }
      return { ...pack, author, checkPreview, expert, visibility, visibleToOrgIds };
    })
    .filter(Boolean) as (SkillPack & { author: string; visibility: Visibility; visibleToOrgIds: string[] })[];

  const regsSet = new Set<string>();
  const indsSet = new Set<string>();
  for (const p of allPacks) {
    p.regs.forEach((r) => regsSet.add(r));
    p.inds.forEach((i) => indsSet.add(i));
  }

  let result = allPacks;
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(
      (p) => {
        const title = resolveLabel(p.title).toLowerCase();
        const desc = resolveLabel(p.desc).toLowerCase();
        return title.includes(q) || desc.includes(q) ||
          p.regs.some((r) => r.toLowerCase().includes(q)) ||
          p.inds.some((i) => i.toLowerCase().includes(q));
      }
    );
  }
  if (regulation) {
    result = result.filter((p) =>
      p.regs.some((r) => r.toLowerCase() === regulation.toLowerCase())
    );
  }
  if (industry) {
    result = result.filter((p) =>
      p.inds.some((i) => i.toLowerCase() === industry.toLowerCase())
    );
  }

  // Visibility filter
  result = result.filter((p) => canReadPack(user, p.id ?? "", p.visibility, p.author, p.visibleToOrgIds));

  const isSuper = user.platformRole === "superadmin";

  const packs = result.map((p) => ({
    ...p,
    canEdit: isSuper || (p.author && p.author === user.email),
  }));

  return NextResponse.json({ packs, regs: [...regsSet].sort(), inds: [...indsSet].sort() });
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireRole("superadmin", "expert")(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: CreatePackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (!body.documents?.length) {
    return NextResponse.json({ error: "at least one document is required" }, { status: 400 });
  }
  for (const doc of body.documents) {
    if (!doc.type?.trim()) {
      return NextResponse.json({ error: "each document must have a type" }, { status: 400 });
    }
    if (!doc.title?.trim()) {
      return NextResponse.json({ error: "each document must have a title" }, { status: 400 });
    }
    if (!doc.fields?.length) {
      return NextResponse.json({ error: `document "${doc.type}" must have at least one field` }, { status: 400 });
    }
  }

  if (!body.industries?.length) body.industries = ["General"];
  if (!body.regulation_ids?.length) body.regulation_ids = [];
  if (!body.triggers?.length) body.triggers = [body.title];

  const existingIds = new Set(listPacks());
  const id = generateId(body.title, existingIds);

  const packDir = path.join(PACKS_DIR, id);
  if (fs.existsSync(packDir)) {
    return NextResponse.json({ error: "Pack with this name already exists" }, { status: 409 });
  }
  fs.mkdirSync(packDir, { recursive: true });

  // Collect all unique fields across documents (top-level)
  const fieldMap = new Map<string, FieldBody>();
  for (const doc of body.documents) {
    for (const f of doc.fields) {
      fieldMap.set(f.field, f);
    }
  }
  const fields = Array.from(fieldMap.values()).map((f) => {
    const out: Record<string, unknown> = {
      id: f.field,
      label: f.label,
      required: f.required,
    };
    if (f.type !== "text") out.type = f.type;
    if (f.options?.length) out.options = f.options;
    if (f.validation) out.validation = f.validation;
    return out;
  });

  // Matches engine's writePack() format so loadPack() can read it identically
  const packExpert = body.expert ? {
    name: body.expert.name,
    ...(body.expert.contact ? { contact: body.expert.contact } : {}),
    ...(body.expert.intro ? { intro: body.expert.intro } : {}),
  } : undefined;

  const packJson = {
    pack: {
      title: body.title,
      author: user.email,
      description: body.description,
      industries: body.industries,
      icon: body.icon ?? "📋",
      version: "1.0.0",
      regulation_ids: body.regulation_ids,
      checkPreview: body.checkPreview ?? "full",
      visibility: body.visibility ?? getDefaultVisibility(id),
      ...(body.visibleToOrgIds?.length ? { visibleToOrgIds: body.visibleToOrgIds } : {}),
      ...(packExpert ? { expert: packExpert } : {}),
    },
    fields,
    documents: body.documents.map((d) => {
      const doc: Record<string, unknown> = {
        type: d.type,
        title: d.title,
        fields: d.fields.map((f) => f.field),
      };
      if (d.template) doc.template = d.template;
      return doc;
    }),
    checks: body.checks ?? [],
    redlines: body.redlines ?? [],
    lessons: body.lessons ?? [],
  };

  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(packJson, null, 2), "utf-8");

  // SKILL.md is required for listPacks() / loadPack() to discover this pack
  fs.writeFileSync(path.join(packDir, "SKILL.md"), `# ${body.title}\n\nCompliance pack: ${body.description}`, "utf-8");

  return NextResponse.json({ id, title: body.title }, { status: 201 });
}
