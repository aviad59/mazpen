import * as React from "react";
import { Dashboard } from "./components/Dashboard";
import { SearchView } from "./components/SearchView";
import { ArchiveView } from "./components/ArchiveView";
import { TopBar } from "./components/TopBar";
import { BottomNav, type Tab } from "./components/BottomNav";
import { QuickAddSheet } from "./components/QuickAddSheet";
import { DiscussionDetail } from "./components/DiscussionDetail";
import { useStore } from "./store/useStore";
import type { Discussion } from "./types";

export default function App() {
  const { discussions, reseed } = useStore();
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [addOpen, setAddOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [template, setTemplate] = React.useState<Partial<Discussion> | null>(null);

  const openDiscussion = discussions.find((d) => d.id === openId) ?? null;
  const pendingScheduling = discussions.filter(
    (d) => d.status === "requires_scheduling"
  ).length;

  function handleReseed() {
    if (confirm("לאפס נתונים ולהחזיר את ערכת הדוגמה?")) {
      reseed();
    }
  }

  function handleDuplicate(d: Discussion) {
    setTemplate({
      name: `${d.name} (עותק)`,
      requester: d.requester,
      priority: d.priority,
      participantIds: d.participantIds,
      leaderId: d.leaderId,
      requiresSummary: d.requiresSummary,
      requiresApproval: d.requiresApproval,
      requiresDistribution: d.requiresDistribution,
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
        onReseed={handleReseed}
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
        onCreated={(d) => {
          // After create, open the detail to encourage filling extra info
          setOpenId(d.id);
        }}
        template={template}
      />

      <DiscussionDetail
        open={!!openDiscussion}
        discussion={openDiscussion}
        onClose={() => setOpenId(null)}
        onDuplicate={handleDuplicate}
      />
    </div>
  );
}
