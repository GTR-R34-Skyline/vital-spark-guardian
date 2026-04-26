import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Activity,
  LayoutDashboard,
  Code2,
  BarChart3,
  ListChecks,
  Shield,
  LogOut,
} from "lucide-react";
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

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );

  return (
    <div className="min-h-screen bg-background flex relative overflow-hidden">
      {/* Background ambient glow effect */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      
      <aside className="w-64 border-r border-border/50 bg-background/40 backdrop-blur-xl shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] flex flex-col z-10">
        <Link to="/" className="flex items-center gap-3 px-6 py-6 border-b border-border/50 hover:bg-white/5 transition-colors">
          <div
            className="size-10 rounded-xl flex items-center justify-center shadow-elegant"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Activity className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight tracking-tight text-foreground">VitalSync</div>
            <div className="text-xs font-medium text-primary/80 leading-tight">Patient Monitor</div>
          </div>
        </Link>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems
            .filter((n) => !n.adminOnly || isAdmin)
            .map((n) => {
              const active = loc.pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-300 ease-out group",
                    active
                      ? "bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground hover:translate-x-1"
                  )}
                >
                  <Icon className={cn("size-4.5 transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")} />
                  {n.label}
                  {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                </Link>
              );
            })}
        </nav>

        <div className="p-4 border-t border-border/50 bg-muted/20">
          {user ? (
            <div className="space-y-3">
              <div className="px-2">
                <div className="text-sm font-semibold truncate text-foreground">{user.email}</div>
                <div className="text-xs font-medium text-muted-foreground mt-0.5 uppercase tracking-wider">{roles.join(", ") || "User"}</div>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-start hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors" onClick={logout}>
                <LogOut className="size-4 mr-2" />
                Sign out
              </Button>
            </div>
          ) : (
            <Button asChild size="sm" className="w-full shadow-elegant">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden relative z-0">{children}</main>
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
    return (
      <div className="p-10">
        <h2 className="text-xl font-semibold mb-2">Admin only</h2>
        <p className="text-muted-foreground">This page requires the admin role.</p>
      </div>
    );
  }
  return <>{children}</>;
}
