import * as React from "react";
import { Dashboard } from "./components/Dashboard";
import { SearchView } from "./components/SearchView";
import { ArchiveView } from "./components/ArchiveView";
import { InboxView } from "./components/InboxView";
import { TopBar } from "./components/TopBar";
import { BottomNav, type Tab } from "./components/BottomNav";
import { QuickAddSheet } from "./components/QuickAddSheet";
import { DiscussionDetail } from "./components/DiscussionDetail";
import { ParticipantsSheet } from "./components/ParticipantsSheet";
import { NotificationSettingsSheet } from "./components/NotificationSettingsSheet";
import { BackendErrorScreen } from "./components/BackendErrorScreen";
import { LoginScreen } from "./components/LoginScreen";
import { IOSInstallBanner } from "./components/IOSInstallBanner";
import { EnableNotificationsBanner } from "./components/EnableNotificationsBanner";
import { BashiReviewAlert } from "./components/BashiReviewAlert";
import { TasksView } from "./components/TasksView";
import { useStore, setCurrentUserName } from "./store/useStore";
import { loadTaskData } from "./store/useTaskStore";
import { loadRequestData, useRequestStore } from "./store/useRequestStore";
import { upsertProfile } from "./lib/tasksDb";
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
  const { requests } = useRequestStore();
  const pendingInboxCount = requests.filter((r) => r.status === "pending").length;
  const isBashiUser = user?.user_metadata?.full_name === "רותם בשי";
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [addOpen, setAddOpen] = React.useState(false);
  const [addTaskOpen, setAddTaskOpen] = React.useState(false);
  const [bashiAlertOpen, setBashiAlertOpen] = React.useState(true);
  const [participantsOpen, setParticipantsOpen] = React.useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(() => getAndClearSharedId());
  const [template, setTemplate] = React.useState<Partial<Discussion> | null>(null);

  // Keep store stamping in sync with auth user; upsert profile and load tasks
  React.useEffect(() => {
    const name = user?.user_metadata?.full_name ?? user?.email ?? "";
    setCurrentUserName(name);
    if (user) {
      upsertProfile({ id: user.id, displayName: name, email: user.email }).catch(() => {});
      loadTaskData();
      loadRequestData();
    }
  }, [user]);

  const bashiPending = discussions.filter((d) => d.requiresBashiReview);

  // Re-open alert when new flagged discussions appear
  React.useEffect(() => {
    if (isBashiUser && bashiPending.length > 0) setBashiAlertOpen(true);
    if (bashiPending.length === 0) setBashiAlertOpen(false);
  }, [isBashiUser, bashiPending.length]);

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
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-background text-foreground flex flex-col">
      <TopBar
        onAdd={() => {
          setTemplate(null);
          setAddOpen(true);
        }}
        onOpenSearch={() => setTab("search")}
        onOpenParticipants={() => setParticipantsOpen(true)}
        onOpenNotificationSettings={() => setNotificationSettingsOpen(true)}
        onClearAll={handleClearAll}
        pendingScheduling={pendingScheduling}
        onSignOut={signOut}
        userEmail={user.email}
      />

      <main className="flex-1 min-h-0 max-w-xl w-full mx-auto lg:max-w-none lg:overflow-hidden">
        {tab === "dashboard" && <Dashboard onOpenDiscussion={setOpenId} />}
        {(tab as string) === "search" && <SearchView onOpenDiscussion={setOpenId} />}
        {tab === "inbox" && <InboxView />}
        {tab === "archive" && <ArchiveView onOpenDiscussion={setOpenId} />}
        {tab === "tasks" && <TasksView addOpen={addTaskOpen} onAddClose={() => setAddTaskOpen(false)} />}
      </main>

      <BottomNav
        tab={tab}
        onChange={setTab}
        inboxCount={pendingInboxCount}
        onAdd={() => {
          if (tab === "tasks") {
            setAddTaskOpen(true);
          } else {
            setTemplate(null);
            setAddOpen(true);
          }
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
        isBashiUser={isBashiUser}
      />

      {isBashiUser && bashiAlertOpen && (
        <BashiReviewAlert
          discussions={bashiPending}
          onClose={() => setBashiAlertOpen(false)}
          onOpen={setOpenId}
        />
      )}

      <ParticipantsSheet
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
      />

      <NotificationSettingsSheet
        open={notificationSettingsOpen}
        onClose={() => setNotificationSettingsOpen(false)}
      />
    </div>
  );
}
