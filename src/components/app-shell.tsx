import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { Activity, LayoutDashboard, Code2, BarChart3, ListChecks, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, hasRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/eda", label: "Analytics", icon: BarChart3 },
  { to: "/rules", label: "Rules (DSL)", icon: Code2, adminOnly: true },
  { to: "/pm", label: "Project", icon: ListChecks },
  { to: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, roles, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isAdmin = hasRole(roles, "admin");

  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 border-r bg-card/50 backdrop-blur flex flex-col">
        <Link to="/" className="flex items-center gap-2 px-5 py-5 border-b">
          <div className="size-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Activity className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold leading-tight">VitalSync</div>
            <div className="text-xs text-muted-foreground leading-tight">Patient Monitor</div>
          </div>
        </Link>

        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter(n => !n.adminOnly || isAdmin)
            .map(n => {
              const active = loc.pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link key={n.to} to={n.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />{n.label}
                </Link>
              );
            })}
        </nav>

        <div className="p-3 border-t">
          {user ? (
            <div className="space-y-2">
              <div className="px-2 text-xs">
                <div className="font-medium truncate">{user.email}</div>
                <div className="text-muted-foreground">{roles.join(", ") || "—"}</div>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
                <LogOut className="size-4 mr-2" />Sign out
              </Button>
            </div>
          ) : (
            <Button asChild size="sm" className="w-full"><Link to="/auth">Sign in</Link></Button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

export function RequireAuth({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, roles, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!user) {
    setTimeout(() => nav({ to: "/auth", search: { redirect: loc.pathname } as never }), 0);
    return <div className="p-10 text-muted-foreground">Redirecting…</div>;
  }
  if (admin && !hasRole(roles, "admin")) {
    return <div className="p-10"><h2 className="text-xl font-semibold mb-2">Admin only</h2><p className="text-muted-foreground">This page requires the admin role.</p></div>;
  }
  return <>{children}</>;
}
