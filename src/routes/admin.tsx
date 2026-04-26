import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — VitalSync" }] }),
  component: () => (
    <RequireAuth admin>
      <AppShell>
        <AdminPage />
      </AppShell>
    </RequireAuth>
  ),
});

interface UserRow {
  user_id: string;
  display_name: string | null;
  roles: string[];
}

function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);

  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const map = new Map<string, UserRow>();
    for (const p of profiles ?? [])
      map.set(p.id, { user_id: p.id, display_name: p.display_name, roles: [] });
    for (const r of roles ?? []) {
      const u = map.get(r.user_id) ?? { user_id: r.user_id, display_name: null, roles: [] };
      u.roles.push(r.role);
      map.set(r.user_id, u);
    }
    setUsers([...map.values()]);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggleRole(uid: string, role: "admin" | "doctor", has: boolean) {
    if (has) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", uid)
        .eq("role", role);
      if (error) toast.error(error.message);
      else load();
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
      if (error) toast.error(error.message);
      else load();
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="size-6 text-primary" /> Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage role assignments. Roles are stored in a separate{" "}
          <code className="text-xs bg-muted px-1 rounded">user_roles</code> table guarded by a
          security-definer function to prevent privilege escalation.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Users & roles</CardTitle>
          <CardDescription>{users.length} accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {users.map((u) => (
              <li key={u.user_id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {u.display_name ?? u.user_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.user_id}</div>
                </div>
                <div className="flex gap-2">
                  {(["admin", "doctor"] as const).map((r) => {
                    const has = u.roles.includes(r);
                    return (
                      <Button
                        key={r}
                        variant={has ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleRole(u.user_id, r, has)}
                      >
                        {has ? "✓ " : ""}
                        {r}
                      </Button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Security posture</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5 text-muted-foreground">
          <p>
            ✓ Email/password authentication via Lovable Cloud (HTTPS by default on preview &
            published URLs)
          </p>
          <p>
            ✓ Roles in separate <code className="bg-muted px-1 rounded">user_roles</code> table; RLS
            uses <code className="bg-muted px-1 rounded">has_role()</code> security-definer fn
          </p>
          <p>✓ Patient external IDs hashed with SHA-256 before storage</p>
          <p>✓ Patient names AES-GCM encrypted at rest</p>
          <p>✓ All tables have row-level security; non-authenticated requests are rejected</p>
          <Badge variant="secondary" className="mt-2">
            Production-style prototype
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
