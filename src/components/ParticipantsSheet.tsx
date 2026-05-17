import * as React from "react";
import { Plus, Pencil, Trash2, X, Check, Users as UsersIcon, FolderOpen } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { useStore } from "@/store/useStore";
import { HOME_UNIT } from "@/lib/he";
import type { Participant, ParticipantGroup } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DraftFields {
  name: string;
  role: string;
  unit: string;
}

const EMPTY: DraftFields = { name: "", role: "", unit: HOME_UNIT };

type Tab = "participants" | "groups";

export function ParticipantsSheet({ open, onClose }: Props) {
  const {
    participants,
    groups,
    addParticipant,
    updateParticipant,
    removeParticipant,
    addGroup,
    updateGroup,
    removeGroup,
  } = useStore();

  const [tab, setTab] = React.useState<Tab>("participants");

  // --- participant state ---
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftFields>(EMPTY);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftFields>(EMPTY);
  const [filter, setFilter] = React.useState("");

  // --- group state ---
  const [creatingGroup, setCreatingGroup] = React.useState(false);
  const [groupDraftName, setGroupDraftName] = React.useState("");
  const [groupDraftIds, setGroupDraftIds] = React.useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [editGroupName, setEditGroupName] = React.useState("");
  const [editGroupIds, setEditGroupIds] = React.useState<string[]>([]);
  const [groupFilter, setGroupFilter] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setDraft(EMPTY);
      setEditingId(null);
      setFilter("");
      setCreatingGroup(false);
      setGroupDraftName("");
      setGroupDraftIds([]);
      setEditingGroupId(null);
      setGroupFilter("");
      setTab("participants");
    }
  }, [open]);

  // --- participant helpers ---
  const filtered = React.useMemo(() => {
    const q = filter.trim();
    const list = q
      ? participants.filter(
          (p) =>
            p.name.includes(q) ||
            (p.role && p.role.includes(q)) ||
            (p.unit && p.unit.includes(q))
        )
      : participants;
    return [...list].sort((a, b) => {
      const aExt = !!a.unit && a.unit !== HOME_UNIT ? 1 : 0;
      const bExt = !!b.unit && b.unit !== HOME_UNIT ? 1 : 0;
      if (aExt !== bExt) return aExt - bExt;
      return a.name.localeCompare(b.name, "he");
    });
  }, [participants, filter]);

  async function handleCreate() {
    const name = draft.name.trim();
    if (!name) return;
    await addParticipant({
      name,
      role: draft.role.trim() || undefined,
      unit: draft.unit.trim() || HOME_UNIT,
      external: !!draft.unit.trim() && draft.unit.trim() !== HOME_UNIT,
    });
    setDraft(EMPTY);
    setCreating(false);
  }

  function startEdit(p: Participant) {
    setEditingId(p.id);
    setEditDraft({ name: p.name, role: p.role ?? "", unit: p.unit ?? HOME_UNIT });
  }

  async function commitEdit() {
    if (!editingId) return;
    const original = participants.find((p) => p.id === editingId);
    if (!original) return;
    const unit = editDraft.unit.trim() || HOME_UNIT;
    await updateParticipant({
      ...original,
      name: editDraft.name.trim() || original.name,
      role: editDraft.role.trim() || undefined,
      unit,
      external: unit !== HOME_UNIT,
    });
    setEditingId(null);
  }

  async function handleDelete(p: Participant) {
    if (!confirm(`למחוק את ${p.name}?`)) return;
    await removeParticipant(p.id);
  }

  // --- group helpers ---
  const filteredGroups = React.useMemo(() => {
    const q = groupFilter.trim();
    if (!q) return groups;
    return groups.filter((g) => g.name.includes(q));
  }, [groups, groupFilter]);

  function toggleGroupMember(ids: string[], id: string): string[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  }

  async function handleCreateGroup() {
    const name = groupDraftName.trim();
    if (!name) return;
    await addGroup({ name, participantIds: groupDraftIds });
    setGroupDraftName("");
    setGroupDraftIds([]);
    setCreatingGroup(false);
  }

  function startEditGroup(g: ParticipantGroup) {
    setEditingGroupId(g.id);
    setEditGroupName(g.name);
    setEditGroupIds(g.participantIds);
  }

  async function commitEditGroup() {
    if (!editingGroupId) return;
    const original = groups.find((g) => g.id === editingGroupId);
    if (!original) return;
    await updateGroup({ ...original, name: editGroupName.trim() || original.name, participantIds: editGroupIds });
    setEditingGroupId(null);
  }

  async function handleDeleteGroup(g: ParticipantGroup) {
    if (!confirm(`למחוק את הקבוצה "${g.name}"?`)) return;
    await removeGroup(g.id);
  }

  // --- footer ---
  const footer =
    tab === "participants" ? (
      creating ? (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => { setCreating(false); setDraft(EMPTY); }}
            className="flex-1"
          >
            ביטול
          </Button>
          <Button size="md" onClick={handleCreate} disabled={!draft.name.trim()} className="flex-[2]">
            שמור משתתף
          </Button>
        </div>
      ) : (
        <Button onClick={() => setCreating(true)} className="w-full" size="md">
          <Plus size={16} />
          הוסף משתתף חדש
        </Button>
      )
    ) : creatingGroup ? (
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="md"
          onClick={() => { setCreatingGroup(false); setGroupDraftName(""); setGroupDraftIds([]); }}
          className="flex-1"
        >
          ביטול
        </Button>
        <Button size="md" onClick={handleCreateGroup} disabled={!groupDraftName.trim()} className="flex-[2]">
          שמור קבוצה
        </Button>
      </div>
    ) : (
      <Button onClick={() => setCreatingGroup(true)} className="w-full" size="md">
        <Plus size={16} />
        הוסף קבוצה חדשה
      </Button>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <UsersIcon size={18} />
          ניהול משתתפים
        </span>
      }
      footer={footer}
    >
      {/* Tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setTab("participants")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
            tab === "participants"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <UsersIcon size={14} />
          משתתפים
        </button>
        <button
          type="button"
          onClick={() => setTab("groups")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
            tab === "groups"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <FolderOpen size={14} />
          קבוצות
        </button>
      </div>

      {/* Participants tab */}
      {tab === "participants" && (
        <div className="space-y-4">
          {creating && (
            <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
              <div className="text-sm font-semibold">משתתף חדש</div>
              <div>
                <Label>שם מלא *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  autoFocus
                  placeholder="לדוגמה: דנה ברקת"
                />
              </div>
              <div>
                <Label>תפקיד / דרגה</Label>
                <Input
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder={'לדוגמה: סא"ל · ראש מבצעים'}
                />
              </div>
              <div>
                <Label>יחידה</Label>
                <Input
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="לדוגמה: מצפן / אוגדה 162 / חיל האוויר"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  יחידה ששונה מ-"{HOME_UNIT}" תסומן כחיצונית.
                </p>
              </div>
            </Card>
          )}

          {!creating && (
            <Input
              placeholder="חפש משתתף, תפקיד או יחידה..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={<UsersIcon size={32} />}
              title={filter ? "לא נמצאו משתתפים" : "אין משתתפים עדיין"}
              hint={filter ? "נסה חיפוש אחר" : "הוסף משתתף ראשון בלחיצה על הכפתור למטה"}
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => {
                const isExternal = !!p.unit && p.unit !== HOME_UNIT;
                const isEditing = editingId === p.id;
                return (
                  <li key={p.id}>
                    <Card className="p-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                            placeholder="שם"
                          />
                          <Input
                            value={editDraft.role}
                            onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                            placeholder="תפקיד / דרגה"
                          />
                          <Input
                            value={editDraft.unit}
                            onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
                            placeholder="יחידה"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="flex-1">
                              <X size={14} /> ביטול
                            </Button>
                            <Button size="sm" onClick={commitEdit} className="flex-[2]">
                              <Check size={14} /> שמור
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{p.name}</span>
                              {isExternal && <Badge tone="warning">חיצוני</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[p.role, p.unit].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <button
                            onClick={() => startEdit(p)}
                            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                            aria-label="עריכה"
                            title="עריכה"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                            aria-label="מחיקה"
                            title="מחיקה"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Groups tab */}
      {tab === "groups" && (
        <div className="space-y-4">
          {creatingGroup && (
            <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
              <div className="text-sm font-semibold">קבוצה חדשה</div>
              <div>
                <Label>שם הקבוצה *</Label>
                <Input
                  value={groupDraftName}
                  onChange={(e) => setGroupDraftName(e.target.value)}
                  autoFocus
                  placeholder="לדוגמה: צוות מבצעים, הנהלת האגף"
                />
              </div>
              <div>
                <Label>משתתפים בקבוצה</Label>
                <div className="rounded-lg border border-border bg-card max-h-52 overflow-y-auto">
                  {participants.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">אין משתתפים להוסיף</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {participants
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, "he"))
                        .map((p) => {
                          const isOn = groupDraftIds.includes(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => setGroupDraftIds(toggleGroupMember(groupDraftIds, p.id))}
                                className={`w-full flex items-center gap-3 p-2.5 text-right hover:bg-muted/70 transition-colors ${isOn ? "bg-accent/5" : ""}`}
                              >
                                <Avatar name={p.name} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{p.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {[p.role, p.unit].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                                {isOn && <Check size={16} className="text-accent shrink-0" />}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {groupDraftIds.length} משתתפים נבחרו
                </p>
              </div>
            </Card>
          )}

          {!creatingGroup && (
            <Input
              placeholder="חפש קבוצה..."
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            />
          )}

          {filteredGroups.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={32} />}
              title={groupFilter ? "לא נמצאו קבוצות" : "אין קבוצות עדיין"}
              hint={groupFilter ? "נסה חיפוש אחר" : "צור קבוצה ראשונה בלחיצה על הכפתור למטה"}
            />
          ) : (
            <ul className="space-y-2">
              {filteredGroups.map((g) => {
                const isEditing = editingGroupId === g.id;
                const memberNames = g.participantIds
                  .map((id) => participants.find((p) => p.id === id)?.name)
                  .filter(Boolean);
                return (
                  <li key={g.id}>
                    <Card className="p-3">
                      {isEditing ? (
                        <div className="space-y-3">
                          <Input
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            placeholder="שם הקבוצה"
                          />
                          <div className="rounded-lg border border-border bg-card max-h-52 overflow-y-auto">
                            <ul className="divide-y divide-border">
                              {participants
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name, "he"))
                                .map((p) => {
                                  const isOn = editGroupIds.includes(p.id);
                                  return (
                                    <li key={p.id}>
                                      <button
                                        type="button"
                                        onClick={() => setEditGroupIds(toggleGroupMember(editGroupIds, p.id))}
                                        className={`w-full flex items-center gap-3 p-2.5 text-right hover:bg-muted/70 transition-colors ${isOn ? "bg-accent/5" : ""}`}
                                      >
                                        <Avatar name={p.name} size="sm" />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium truncate">{p.name}</div>
                                          <div className="text-xs text-muted-foreground truncate">
                                            {[p.role, p.unit].filter(Boolean).join(" · ")}
                                          </div>
                                        </div>
                                        {isOn && <Check size={16} className="text-accent shrink-0" />}
                                      </button>
                                    </li>
                                  );
                                })}
                            </ul>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {editGroupIds.length} משתתפים נבחרו
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingGroupId(null)} className="flex-1">
                              <X size={14} /> ביטול
                            </Button>
                            <Button size="sm" onClick={commitEditGroup} className="flex-[2]">
                              <Check size={14} /> שמור
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent mt-0.5">
                            <FolderOpen size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{g.name}</span>
                              <Badge tone="neutral">{g.participantIds.length}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {memberNames.join("، ") || "אין משתתפים"}
                            </div>
                          </div>
                          <button
                            onClick={() => startEditGroup(g)}
                            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                            aria-label="עריכה"
                            title="עריכה"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(g)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                            aria-label="מחיקה"
                            title="מחיקה"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
