import { streamText, tool } from "ai";
import { z } from "zod";
import { createModel } from "../agent/llm/factory";
import { TOOL_DEFS, type ToolName } from "../compliance-tools";

const PACK_DESIGNER_PROMPT = `You are a compliance pack designer. Create a complete compliance pack based on the user's request.

Available tools:
- extract_file_content — read uploaded regulation documents
- seed_regulation — save regulation clause structure to the DB
- get_regulation_text — read regulation text or clauses from the DB
- search_clauses — keyword search across seeded regulations
- manage_field — add, update, or remove questionnaire fields
- manage_check — add, update, or remove compliance checks
- manage_document_template — add, update, or remove document templates
- publish_pack — save the completed pack to disk

Suggested workflow:
1. Extract + seed any uploaded regulation documents so they're queryable
2. Read the regulation text to understand its requirements
3. Design the pack: fields (user-facing questions), checks (auditor evaluations), documents (output artifacts)
4. Use manage_* tools to iteratively build the pack
5. Call publish_pack when the design is complete

Guidelines:
- Fields should be user-facing questions that collect data needed by checks
- Checks should reference regulation clauses via get_regulation_text or search_clauses
- Group related requirements into logical fields rather than 1:1 clause mapping
- You can review and refine your design with multiple manage_* calls before publishing`;

const PACK_TOOLS: ToolName[] = [
  "extract_file_content",
  "seed_regulation",
  "get_regulation_text",
  "search_clauses",
  "manage_field",
  "manage_document_template",
  "manage_check",
  "publish_pack",
];

interface DesignPackResult {
  packId: string;
  fieldCount: number;
  checkCount: number;
  docCount: number;
}

export async function designPackSubOrchestrator(
  sessionId: string,
  userGoal: string
): Promise<DesignPackResult> {
  const llmModel = createModel({ cache: true });

  const registeredTools = Object.fromEntries(
    PACK_TOOLS.map((name) => {
      const def = TOOL_DEFS[name];
      if (!def) throw new Error(`Pack tool "${name}" not found in TOOL_DEFS`);
      return [
        name,
        tool({
          description: def.description,
          inputSchema: def.inputSchema!,
          execute: (input) => def.execute(sessionId, input as Record<string, unknown>),
        }),
      ];
    })
  );

  const result = streamText({
    model: llmModel,
    system: PACK_DESIGNER_PROMPT,
    messages: [{ role: "user" as const, content: userGoal }],
    tools: registeredTools,
    maxRetries: 3,
    stopWhen: ({ steps }) => {
      if (steps.length >= 10) return true;
      for (const step of steps) {
        for (const tc of step.toolCalls ?? []) {
          if (tc.toolName === "publish_pack") return true;
        }
      }
      return false;
    },
  });

  let packId = "";
  let fieldCount = 0;
  let checkCount = 0;
  let docCount = 0;

  for await (const event of result.fullStream) {
    if (event.type === "tool-result" && event.toolName === "publish_pack") {
      const out = event.output as Record<string, unknown>;
      packId = (out.packId ?? out.id ?? "") as string;
      fieldCount = (out.fieldCount ?? 0) as number;
      checkCount = (out.checkCount ?? 0) as number;
      docCount = (out.documentCount ?? 0) as number;
    }
  }

  if (!packId) {
    throw new Error("Pack designer did not call publish_pack");
  }

  return { packId, fieldCount, checkCount, docCount };
}
