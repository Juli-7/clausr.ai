// Client-safe exports — no Node.js server dependencies
// Only functions and types that work in the browser

export { generateDocx } from "./agent/present/export/export-docx";

export type { AgentResponse } from "./agent/shared/schemas";
