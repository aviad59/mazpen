import * as React from "react";
import { Dashboard } from "./components/Dashboard";
import { SearchView } from "./components/SearchView";
import { ArchiveView } from "./components/ArchiveView";
import { TopBar } from "./components/TopBar";
import { BottomNav, type Tab } from "./components/BottomNav";
import { QuickAddSheet } from "./components/QuickAddSheet";
import { DiscussionDetail } from "./components/DiscussionDetail";
import { ParticipantsSheet } from "./components/ParticipantsSheet";
import { BackendErrorScreen } from "./components/BackendErrorScreen";
import { LoginScreen } from "./components/LoginScreen";
import { IOSInstallBanner } from "./components/IOSInstallBanner";
import { EnableNotificationsBanner } from "./components/EnableNotificationsBanner";
import { useStore, setCurrentUserName } from "./store/useStore";
import { useAuth } from "./lib/useAuth";
import { usePushNotifications } from "./lib/usePushNotifications";
import type { Discussion } from "./types";

/** Read ?id= from the URL once on mount, then clean the param. */
function getAndClearSharedId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      params.delete("id");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "");
      window.history.replaceState(null, "", newUrl);
    }
    return id;
  } catch {
    return null;
  }
}

export default function App() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const { discussions, error, clearAll, reload } = useStore();
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [addOpen, setAddOpen] = React.useState(false);
  const [participantsOpen, setParticipantsOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(() => getAndClearSharedId());
  const [template, setTemplate] = React.useState<Partial<Discussion> | null>(null);

  // Keep store stamping in sync with auth user
  React.useEffect(() => {
    const name = user?.user_metadata?.full_name ?? user?.email ?? "";
    setCurrentUserName(name);
  }, [user]);

  const { state: pushState, subscribe: subscribePush } = usePushNotifications(user?.id);

  // On non-iOS: auto-prompt for push permission after login (only if not yet decided)
  React.useEffect(() => {
    if (user && pushState === "idle") {
      const t = setTimeout(() => subscribePush(), 3000);
      return () => clearTimeout(t);
    }
  }, [user, pushState, subscribePush]);

  // Auth loading state
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">{"טוען..."}</div>
      </div>
    );
  }

  // Not logged in
  if (user === null) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  if (error) {
    return <BackendErrorScreen error={error} onRetry={() => reload()} />;
  }

  const openDiscussion = discussions.find((d) => d.id === openId) ?? null;

  const pendingScheduling = discussions.filter(
    (d) => (d.status === "new" || d.status === "coordinated") && d.dateWindow === "unspecified"
  ).length;

  function handleClearAll() {
    if (confirm("למחוק את כל הדיונים והמשתתפים? פעולה זו לא ניתנת לשחזור.")) {
      clearAll();
    }
  }

  function handleDuplicate(d: Discussion) {
    setTemplate({
      name: d.name + " (עותק)",
      participantIds: d.participantIds,
      leaderId: d.leaderId,
      requiresSummary: d.requiresSummary,
      requiresSubstrate: d.requiresSubstrate,
      recurrence: d.recurrence,
      dateWindow: d.dateWindow,
      notes: d.notes,
    });
    setOpenId(null);
    setAddOpen(true);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar
        onAdd={() => {
          setTemplate(null);
          setAddOpen(true);
        }}
        onOpenSearch={() => setTab("search")}
        onOpenParticipants={() => setParticipantsOpen(true)}
        onClearAll={handleClearAll}
        pendingScheduling={pendingScheduling}
        onSignOut={signOut}
        userEmail={user.email}
      />

      <main className="flex-1 max-w-xl w-full mx-auto">
        {tab === "dashboard" && <Dashboard onOpenDiscussion={setOpenId} />}
        {tab === "search" && <SearchView onOpenDiscussion={setOpenId} />}
        {tab === "archive" && <ArchiveView onOpenDiscussion={setOpenId} />}
      </main>

      <BottomNav
        tab={tab}
        onChange={setTab}
        onAdd={() => {
          setTemplate(null);
          setAddOpen(true);
        }}
      />

      {/* iOS Safari: show install instructions */}
      {pushState === "needs_install" && <IOSInstallBanner />}

      {/* iOS standalone: needs a user tap before we can request permission */}
      {pushState === "needs_tap" && user && (
        <EnableNotificationsBanner onEnable={subscribePush} />
      )}

      <QuickAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(d) => setOpenId(d.id)}
        template={template}
      />

      <DiscussionDetail
        open={!!openDiscussion}
        discussion={openDiscussion}
        onClose={() => setOpenId(null)}
        onDuplicate={handleDuplicate}
      />

      <ParticipantsSheet
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
      />
    </div>
  );
}
