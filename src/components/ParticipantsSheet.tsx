import * as React from "react";
import { Plus, Pencil, Trash2, X, Check, Users as UsersIcon, Layers } from "lucide-react";
import { Sheet } from "./ui/Sheet";
import { Input, Label } from "./ui/Input";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { ParticipantPicker } from "./ParticipantPicker";
import { useStore } from "@/store/useStore";
import { HOME_UNIT } from "@/lib/he";
import type { Participant, ParticipantGroup } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "participants" | "groups";

// --- Participant draft ---
interface PDraft { name: string; role: string; unit: string; optional: boolean; }
const PEMPTY: PDraft = { name: "", role: "", unit: HOME_UNIT, optional: false };

// --- Group draft ---
interface GDraft { name: string; participantIds: string[]; }
const GEMPTY: GDraft = { name: "", participantIds: [] };

export function ParticipantsSheet({ open, onClose }: Props) {
  const {
    participants, addParticipant, updateParticipant, removeParticipant,
    groups, addGroup, updateGroup, removeGroup,
  } = useStore();

  const [tab, setTab] = React.useState<Tab>("participants");

  // Participant state
  const [pCreating, setPCreating] = React.useState(false);
  const [pDraft, setPDraft] = React.useState<PDraft>(PEMPTY);
  const [pEditingId, setPEditingId] = React.useState<string | null>(null);
  const [pEditDraft, setPEditDraft] = React.useState<PDraft>(PEMPTY);
  const [filter, setFilter] = React.useState("");

  // Group state
  const [gCreating, setGCreating] = React.useState(false);
  const [gDraft, setGDraft] = React.useState<GDraft>(GEMPTY);
  const [gEditingId, setGEditingId] = React.useState<string | null>(null);
  const [gEditDraft, setGEditDraft] = React.useState<GDraft>(GEMPTY);

  React.useEffect(() => {
    if (!open) {
      setTab("participants");
      setPCreating(false); setPDraft(PEMPTY); setPEditingId(null); setFilter("");
      setGCreating(false); setGDraft(GEMPTY); setGEditingId(null);
    }
  }, [open]);

  // --- Participant handlers ---
  const filtered = React.useMemo(() => {
    const q = filter.trim();
    const list = q
      ? participants.filter((p) =>
          p.name.includes(q) || (p.role && p.role.includes(q)) || (p.unit && p.unit.includes(q))
        )
      : participants;
    return [...list].sort((a, b) => {
      const aExt = !!a.unit && a.unit !== HOME_UNIT ? 1 : 0;
      const bExt = !!b.unit && b.unit !== HOME_UNIT ? 1 : 0;
      if (aExt !== bExt) return aExt - bExt;
      return a.name.localeCompare(b.name, "he");
    });
  }, [participants, filter]);

  async function handlePCreate() {
    const name = pDraft.name.trim();
    if (!name) return;
    await addParticipant({
      name,
      role: pDraft.role.trim() || undefined,
      unit: pDraft.unit.trim() || HOME_UNIT,
      external: !!pDraft.unit.trim() && pDraft.unit.trim() !== HOME_UNIT,
      optional: pDraft.optional,
    });
    setPDraft(PEMPTY);
    setPCreating(false);
  }

  function startPEdit(p: Participant) {
    setPEditingId(p.id);
    setPEditDraft({ name: p.name, role: p.role ?? "", unit: p.unit ?? HOME_UNIT, optional: p.optional ?? false });
  }

  async function commitPEdit() {
    if (!pEditingId) return;
    const orig = participants.find((p) => p.id === pEditingId);
    if (!orig) return;
    const unit = pEditDraft.unit.trim() || HOME_UNIT;
    await updateParticipant({ ...orig, name: pEditDraft.name.trim() || orig.name, role: pEditDraft.role.trim() || undefined, unit, external: unit !== HOME_UNIT, optional: pEditDraft.optional });
    setPEditingId(null);
  }

  async function handlePDelete(p: Participant) {
    if (!confirm(`למחוק את ${p.name}?`)) return;
    await removeParticipant(p.id);
  }

  // --- Group handlers ---
  async function handleGCreate() {
    const name = gDraft.name.trim();
    if (!name || gDraft.participantIds.length === 0) return;
    await addGroup({ name, participantIds: gDraft.participantIds });
    setGDraft(GEMPTY);
    setGCreating(false);
  }

  function startGEdit(g: ParticipantGroup) {
    setGEditingId(g.id);
    setGEditDraft({ name: g.name, participantIds: g.participantIds });
  }

  async function commitGEdit() {
    if (!gEditingId) return;
    const orig = groups.find((g) => g.id === gEditingId);
    if (!orig) return;
    await updateGroup({ ...orig, name: gEditDraft.name.trim() || orig.name, participantIds: gEditDraft.participantIds });
    setGEditingId(null);
  }

  async function handleGDelete(g: ParticipantGroup) {
    if (!confirm(`למחוק את הקבוצה "${g.name}"?`)) return;
    await removeGroup(g.id);
  }

  const isCreating = tab === "participants" ? pCreating : gCreating;

  const footer = tab === "participants" ? (
    pCreating ? (
      <div className="flex gap-2">
        <Button variant="ghost" size="md" onClick={() => { setPCreating(false); setPDraft(PEMPTY); }} className="flex-1">ביטול</Button>
        <Button size="md" onClick={handlePCreate} disabled={!pDraft.name.trim()} className="flex-[2]">שמור משתתף</Button>
      </div>
    ) : (
      <Button onClick={() => setPCreating(true)} className="w-full" size="md"><Plus size={16} />הוסף משתתף חדש</Button>
    )
  ) : (
    gCreating ? (
      <div className="flex gap-2">
        <Button variant="ghost" size="md" onClick={() => { setGCreating(false); setGDraft(GEMPTY); }} className="flex-1">ביטול</Button>
        <Button size="md" onClick={handleGCreate} disabled={!gDraft.name.trim() || gDraft.participantIds.length === 0} className="flex-[2]">שמור קבוצה</Button>
      </div>
    ) : (
      <Button onClick={() => setGCreating(true)} className="w-full" size="md"><Plus size={16} />הוסף קבוצה חדשה</Button>
    )
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          {tab === "participants" ? <UsersIcon size={18} /> : <Layers size={18} />}
          {tab === "participants" ? "ניהול משתתפים" : "ניהול קבוצות"}
        </span>
      }
      footer={footer}
    >
      <div className="space-y-4">
        {/* Tab bar */}
        {!isCreating && (
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTab("participants")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                tab === "participants" ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <UsersIcon size={14} />
              משתתפים
              <span className="text-xs opacity-70">({participants.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("groups")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors border-r border-border ${
                tab === "groups" ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <Layers size={14} />
              קבוצות
              <span className="text-xs opacity-70">({groups.length})</span>
            </button>
          </div>
        )}

        {/* ── Participants tab ── */}
        {tab === "participants" && (
          <>
            {pCreating && (
              <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
                <div className="text-sm font-semibold">משתתף חדש</div>
                <div>
                  <Label>שם מלא *</Label>
                  <Input value={pDraft.name} onChange={(e) => setPDraft({ ...pDraft, name: e.target.value })} autoFocus placeholder="לדוגמה: דנה ברקת" />
                </div>
                <div>
                  <Label>תפקיד / דרגה</Label>
                  <Input value={pDraft.role} onChange={(e) => setPDraft({ ...pDraft, role: e.target.value })} placeholder={'לדוגמה: סא"ל · ראש מבצעים'} />
                </div>
                <div>
                  <Label>יחידה</Label>
                  <Input value={pDraft.unit} onChange={(e) => setPDraft({ ...pDraft, unit: e.target.value })} placeholder="לדוגמה: מצפן / אוגדה 162 / חיל האוויר" />
                  <p className="text-[11px] text-muted-foreground mt-1">יחידה ששונה מ-"{HOME_UNIT}" תסומן כחיצונית.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={pDraft.optional} onChange={(e) => setPDraft({ ...pDraft, optional: e.target.checked })} className="accent-accent w-4 h-4" />
                  <span className="text-sm">השתתפות רשות</span>
                </label>
              </Card>
            )}

            {!pCreating && (
              <Input placeholder="חפש משתתף, תפקיד או יחידה..." value={filter} onChange={(e) => setFilter(e.target.value)} />
            )}

            {filtered.length === 0 ? (
              <EmptyState icon={<UsersIcon size={32} />} title={filter ? "לא נמצאו משתתפים" : "אין משתתפים עדיין"} hint={filter ? "נסה חיפוש אחר" : "הוסף משתתף ראשון בלחיצה על הכפתור למטה"} />
            ) : (
              <ul className="space-y-2">
                {filtered.map((p) => {
                  const isExternal = !!p.unit && p.unit !== HOME_UNIT;
                  const isEditing = pEditingId === p.id;
                  return (
                    <li key={p.id}>
                      <Card className="p-3">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input value={pEditDraft.name} onChange={(e) => setPEditDraft({ ...pEditDraft, name: e.target.value })} placeholder="שם" />
                            <Input value={pEditDraft.role} onChange={(e) => setPEditDraft({ ...pEditDraft, role: e.target.value })} placeholder="תפקיד / דרגה" />
                            <Input value={pEditDraft.unit} onChange={(e) => setPEditDraft({ ...pEditDraft, unit: e.target.value })} placeholder="יחידה" />
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input type="checkbox" checked={pEditDraft.optional} onChange={(e) => setPEditDraft({ ...pEditDraft, optional: e.target.checked })} className="accent-accent w-4 h-4" />
                              <span className="text-sm">השתתפות רשות</span>
                            </label>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setPEditingId(null)} className="flex-1"><X size={14} /> ביטול</Button>
                              <Button size="sm" onClick={commitPEdit} className="flex-[2]"><Check size={14} /> שמור</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Avatar name={p.name} size="md" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold truncate">{p.name}</span>
                                {isExternal && <Badge tone="warning">חיצוני</Badge>}
                                {p.optional && <Badge tone="muted">רשות</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{[p.role, p.unit].filter(Boolean).join(" · ")}</div>
                            </div>
                            <button onClick={() => startPEdit(p)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="עריכה" title="עריכה"><Pencil size={14} /></button>
                            <button onClick={() => handlePDelete(p)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" aria-label="מחיקה" title="מחיקה"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* ── Groups tab ── */}
        {tab === "groups" && (
          <>
            {gCreating && (
              <Card className="p-4 border-accent/40 bg-accent/5 space-y-3">
                <div className="text-sm font-semibold">קבוצה חדשה</div>
                <div>
                  <Label>שם הקבוצה *</Label>
                  <Input value={gDraft.name} onChange={(e) => setGDraft({ ...gDraft, name: e.target.value })} autoFocus placeholder="לדוגמה: צוות מבצעים" />
                </div>
                <div>
                  <Label>משתתפים *</Label>
                  <ParticipantPicker participants={participants} value={gDraft.participantIds} onChange={(ids) => setGDraft({ ...gDraft, participantIds: ids })} />
                  {gDraft.participantIds.length === 0 && (
                    <p className="text-[11px] text-destructive mt-1">קבוצה חייבת לכלול לפחות משתתף אחד.</p>
                  )}
                </div>
              </Card>
            )}

            {groups.length === 0 && !gCreating ? (
              <EmptyState icon={<Layers size={32} />} title="אין קבוצות עדיין" hint="הוסף קבוצה ראשונה בלחיצה על הכפתור למטה" />
            ) : (
              <ul className="space-y-2">
                {groups.map((g) => {
                  const isEditing = gEditingId === g.id;
                  const memberNames = g.participantIds.map((id) => participants.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
                  return (
                    <li key={g.id}>
                      <Card className="p-3">
                        {isEditing ? (
                          <div className="space-y-3">
                            <Input value={gEditDraft.name} onChange={(e) => setGEditDraft({ ...gEditDraft, name: e.target.value })} placeholder="שם הקבוצה" autoFocus />
                            <ParticipantPicker participants={participants} value={gEditDraft.participantIds} onChange={(ids) => setGEditDraft({ ...gEditDraft, participantIds: ids })} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setGEditingId(null)} className="flex-1"><X size={14} /> ביטול</Button>
                              <Button size="sm" onClick={commitGEdit} className="flex-[2]"><Check size={14} /> שמור</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold">{g.name}</span>
                                <Badge tone="muted">{g.participantIds.length} משתתפים</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{memberNames}</div>
                            </div>
                            <button onClick={() => startGEdit(g)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground shrink-0" aria-label="עריכה" title="עריכה"><Pencil size={14} /></button>
                            <button onClick={() => handleGDelete(g)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0" aria-label="מחיקה" title="מחיקה"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
