import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  HandshakeIcon,
  Vote,
  CalendarDays,
  LogOut,
  Menu,
  X,
  UserCircle,
  Inbox,
  BellRing,
  UserPlus,
  CheckSquare,
} from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { HelpButton } from "./HelpButton";
import { AddToHomeScreenButton } from "./AddToHomeScreenButton";
import { supabase } from "@/integrations/supabase/client";
import { OlbLogo } from "./OlbLogo";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/use-profile";
import { DefinirMdpBanner } from "@/components/DefinirMdpBanner";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/membres", label: "Membres", icon: Users },
  { to: "/recommandations", label: "Recommandations", icon: HandshakeIcon },
  { to: "/demandes", label: "Demandes", icon: Inbox },
  { to: "/sondages", label: "Sondages", icon: Vote },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/presences", label: "Présences", icon: CheckSquare, bureauOnly: true },
  { to: "/invites", label: "Invités", icon: UserPlus },
  { to: "/mon-profil", label: "Mon profil", icon: UserCircle },
  { to: "/admin-rappel", label: "Rappel auto", icon: BellRing, adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
  }

  const navContent = (
    <>
      <div className="px-4 py-5 border-b border-sidebar-border bg-[#F8FBFB]">
        <OlbLogo className="h-14 w-auto" />
      </div>
      {profile && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">
              {profile.prenom} {profile.nom}
            </p>
            <Badge variant="outline" className="mt-1 border-sidebar-border text-sidebar-foreground">
              {profile.role === "comite_membres"
                ? "Comité membres"
                : profile.role === "comite_fetes"
                  ? "Comité des fêtes"
                  : profile.role === "bureau"
                    ? "Bureau"
                    : profile.role === "admin"
                      ? "Admin"
                      : "Membre"}
            </Badge>
          </div>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.filter((item) => {
          if ((item as { adminOnly?: boolean }).adminOnly && profile?.role !== "admin")
            return false;
          if (
            (item as { bureauOnly?: boolean }).bureauOnly &&
            !["bureau", "admin"].includes(profile?.role ?? "")
          )
            return false;
          if (
            (item as { comiteOnly?: boolean }).comiteOnly &&
            !["comite_membres", "bureau", "admin"].includes(profile?.role ?? "")
          )
            return false;
          return true;
        }).map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar text-sidebar-foreground">
        {navContent}
      </aside>

      {/* Mobile topbar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-[#F8FBFB] text-[#1F676F] px-3 h-14 border-b border-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-md text-[#1F676F] hover:bg-[#1F676F]/10"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <OlbLogo className="h-9 w-auto" />
        {/* Cloche + aide + installation (mobile) */}
        <div className="flex items-center gap-1">
          <AddToHomeScreenButton />
          <HelpButton title="Aide" ariaLabel="Aide générale">
            <p>
              Bienvenue sur l'application OLB. Utilisez le menu pour naviguer entre les sections.
            </p>
            <p>
              Le bouton « Installer l'app » ajoute un raccourci sur l'écran d'accueil de votre
              téléphone.
            </p>
          </HelpButton>
          <NotificationsBell />
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 flex flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-md hover:bg-sidebar-accent"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      <main className="md:pl-64">
        {/* Header horizontal (desktop) : aide + installation, alignés à droite */}
        <header className="hidden md:flex items-center justify-end gap-1 px-8 h-14 border-b border-border bg-background">
          <NotificationsBell />
          <AddToHomeScreenButton />
          <HelpButton title="Aide" ariaLabel="Aide générale">
            <p>
              Bienvenue sur l'application OLB. Utilisez le menu de gauche pour naviguer entre les
              sections.
            </p>
            <p>
              Le bouton « Installer l'app » ajoute un raccourci sur l'écran d'accueil de votre
              téléphone, pour un accès en un clic.
            </p>
          </HelpButton>
        </header>
        <div className="px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
          <DefinirMdpBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
