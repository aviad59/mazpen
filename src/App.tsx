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
import { useStore } from "./store/useStore";
import type { Discussion } from "./types";

export default function App() {
  const { discussions, error, clearAll, reload } = useStore();
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [addOpen, setAddOpen] = React.useState(false);
  const [participantsOpen, setParticipantsOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [template, setTemplate] = React.useState<Partial<Discussion> | null>(null);

  if (error) {
    return <BackendErrorScreen error={error} onRetry={() => reload()} />;
  }

  const openDiscussion = discussions.find((d) => d.id === openId) ?? null;

  // "Needs a time bucket" indicator — scheduled but no window chosen
  const pendingScheduling = discussions.filter(
    (d) => d.status === "scheduled" && d.dateWindow === "unspecified"
  ).length;

  function handleClearAll() {
    if (confirm("למחוק את כל הדיונים והמשתתפים? פעולה זו לא ניתנת לשחזור.")) {
      clearAll();
    }
  }

  function handleDuplicate(d: Discussion) {
    setTemplate({
      name: `${d.name} (עותק)`,
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
