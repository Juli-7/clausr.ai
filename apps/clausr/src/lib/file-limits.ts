export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
] as const;

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"];

export const ALLOWED_MIME_TYPES: readonly string[] = ALLOWED_TYPES;

export function validateFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`;
  }
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const typeOk = ALLOWED_MIME_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
  if (!typeOk) {
    return `"${file.name}" has unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }
  return null;
}
