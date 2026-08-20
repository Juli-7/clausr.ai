"use client";

import { useState, useEffect, useRef } from "react";
import type { ComplianceSession, DocumentTemplate } from "@/lib/compliance/types";
import type { PackField } from "@clausr/engine";
import { ScopeMarketplace } from "./scope-marketplace";
import { DocumentsPanel } from "./documents-panel";
import { FileFolder } from "./file-folder";
import { AuditPanel } from "./audit-panel";
import { StepSwitcher } from "./step-switcher";
import { t } from "@/lib/compliance/i18n";

interface PackWithFields {
  id: string;
  title: string;
  fields: PackField[];
  documents: { type: string; title: string; fields: string[] }[];
}

interface StepPanelProps {
  session: ComplianceSession | null;
  mode: "auto" | "manual";
  onStepChange: (step: 1 | 2 | 3) => void;
  onScopeChange: (ids: string[], step?: number) => void;
  onSessionRefresh: () => void;
  onAddChatMessage: (text: string) => void;
  onToolMessage: (name: string, isHint?: boolean) => void;
  onSendText?: (text: string) => Promise<void>;
  onCallTool?: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onFileUpload?: (file: File) => void;
  onStartPackCreation?: () => void;
  onEditPack?: (packId: string, initialData: Record<string, unknown>) => void;
}

export function StepPanel({ session, mode, onStepChange, onScopeChange, onSessionRefresh, onAddChatMessage, onToolMessage, onSendText, onCallTool, onFileUpload, onStartPackCreation, onEditPack }: StepPanelProps) {
  const [packs, setPacks] = useState<PackWithFields[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const packKeyRef = useRef("");


  useEffect(() => {
    const ids = session?.selectedPackIds;
    const key = JSON.stringify(ids);
    if (key === packKeyRef.current) return;
    packKeyRef.current = key;
    if (!ids || ids.length === 0) { setPacks([]); setDocTemplates([]); return; }
    Promise.all(
      ids.map((id) =>
        fetch(`/api/compliance/packs/${id}`).then((r) => r.json())
      )
    ).then((rawPacks) => {
      const loaded = (rawPacks as { id: string; title?: string | Record<string, string>; fields: PackField[]; documents: { type: string; title?: string | Record<string, string>; fields: string[] }[] }[]).map((p) => ({
        id: p.id,
        title: typeof p.title === "string" ? p.title : (p.title?.en ?? p.title?.zh ?? p.id),
        fields: p.fields ?? [],
        documents: (p.documents ?? []).map((d) => ({
          type: d.type,
          title: typeof d.title === "string" ? d.title : (d.title?.en ?? d.title?.zh ?? d.type),
          fields: d.fields as string[],
        })),
      }));
      setPacks(loaded);

      const templates = rawPacks.flatMap((p: { documents: { type: string; title?: string | Record<string, string>; fields: string[] }[] }) =>
        (p.documents ?? []).map((d) => ({
          type: d.type,
          title: typeof d.title === "string" ? d.title : (d.title?.en ?? d.title?.zh ?? d.type),
          fields: d.fields as string[],
        }))
      );
      const unique = templates.filter(
        (t, i, arr) => arr.findIndex((x) => x.type === t.type) === i
      );
      setDocTemplates(unique);
    });
  }, [session?.selectedPackIds]);

  if (!session) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-text-muted)", fontSize: 13 }}
      >
        {t("createSession")}
      </div>
    );
  }

  const step = session.step;

  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, right: 14, zIndex: 10 }}>
          <StepSwitcher
            session={session}
            mode={mode}
            onStepChange={onStepChange}
            onScopeChange={onScopeChange}
            docTemplates={docTemplates}
            packs={packs}
          />
      </div>

      <div className="shrink-0" style={{ padding: "10px 20px 6px" }}>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, color: "var(--color-text-header)" }}>
          {step === 1 && t("scopeH")}
          {step === 2 && t("docH")}
          {step === 3 && t("auditH")}
        </h1>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 3, maxWidth: 600, lineHeight: 1.6 }}>
          {step === 1 && t("scopeD")}
          {step === 2 && t("docD")}
          {step === 3 && t("auditD")}
        </p>
      </div>

      <div className="flex-1 min-h-0">
        {step === 1 && (
          <ScopeMarketplace
            sessionId={session.id}
            selectedPackIds={session.selectedPackIds}
            onScopeChange={onScopeChange}
            hideSidebar
            onStartPackCreation={onStartPackCreation}
            onEditPack={onEditPack}
          />
        )}
        {step === 2 && (
          <div className="flex" style={{ height: "100%", gap: 8 }}>
            <div className="flex-1 min-w-0" style={{ overflow: "hidden" }}>
              <DocumentsPanel
                sessionId={session.id}
                selectedPackIds={session.selectedPackIds}
                docData={session.docData}
                uploadedFiles={session.uploadedFiles}
                packs={packs}
                onAddChatMessage={onAddChatMessage}
                onToolMessage={onToolMessage}
                onCallTool={onCallTool}
                mode={mode}
                onSendText={onSendText}
              />
            </div>
            <div className="shrink-0" style={{ width: 280, overflow: "hidden" }}>
              <FileFolder
                sessionId={session.id}
                uploadedFiles={session.uploadedFiles}
                packs={packs}
                docData={session.docData}
                mode={mode}
                onToolMessage={onToolMessage}
                onAddChatMessage={onAddChatMessage}
                onSendText={onSendText}
                onCallTool={onCallTool}
                onFileUpload={onFileUpload}
              />
            </div>
          </div>
        )}
        {step === 3 && (
          <AuditPanel
            sessionId={session.id}
            selectedPackIds={session.selectedPackIds}
            auditResults={session.auditResults}
            auditRunning={session.auditRunning}
            auditDone={session.auditDone}
            agentResponses={session.agentResponses}
            onSessionRefresh={onSessionRefresh}
            onAddChatMessage={onAddChatMessage}
            onCallTool={onCallTool}
            onSendText={onSendText}
            hideSidebar
          />
        )}
      </div>
    </div>
  );
}
