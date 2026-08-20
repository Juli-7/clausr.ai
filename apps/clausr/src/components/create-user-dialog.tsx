"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

interface OrgOption {
  id: string;
  name: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

export function CreateUserDialog({
  orgs,
  expandedOrg,
  isSuper,
  onCreated,
}: {
  orgs: OrgOption[];
  expandedOrg: string | null;
  isSuper: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<"admin" | "expert" | "tester">("tester");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetOrg = orgId || expandedOrg || "";
    if (!targetOrg) { alert("Select an organization"); return; }
    try {
      await api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, orgId: targetOrg, orgRole: role }),
      });
      setOpen(false);
      setEmail(""); setPassword(""); setName(""); setOrgId(""); setRole("tester");
      onCreated();
    } catch (err) { alert((err as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">+ User</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
          <select
            value={orgId || expandedOrg || ""}
            onChange={(e) => setOrgId(e.target.value)}
            className="w-full px-2 py-1.5 rounded border bg-transparent outline-none text-xs cursor-pointer"
            style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
            required
          >
            <option value="">Select org…</option>
            {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "expert" | "tester")}
            className="w-full px-2 py-1.5 rounded border bg-transparent outline-none text-xs cursor-pointer"
            style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
          >
            {isSuper && <option value="admin">admin</option>}
            <option value="expert">expert</option>
            <option value="tester">tester</option>
          </select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
