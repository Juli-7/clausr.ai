"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

interface AppState {
  activeSkillId: string;
  activeSkillName: string;
  setActiveSkill: (id: string, name: string) => void;
  activeSessionId: string | null;
  loadSession: (id: string) => void;
  clearSession: () => void;
}

const AppContext = createContext<AppState>({
  activeSkillId: "",
  activeSkillName: "",
  setActiveSkill: () => {},
  activeSessionId: null,
  loadSession: () => {},
  clearSession: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeSkillId, setActiveSkillId] = useState("");
  const [activeSkillName, setActiveSkillName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        activeSkillId,
        activeSkillName,
        setActiveSkill: (id, name) => {
          setActiveSkillId(id);
          setActiveSkillName(name);
        },
        activeSessionId,
        loadSession: (id) => setActiveSessionId(id),
        clearSession: () => setActiveSessionId(null),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
