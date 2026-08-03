import * as React from "react";
import { Compass, CheckCircle2, Loader2 } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { submitDiscussionRequest } from "@/store/useRequestStore";
import { listParticipantsPublic } from "@/lib/requestsDb";
import { APP_NAME } from "@/lib/he";

interface PublicParticipant {
  id: string;
  name: string;
  role: string | null;
  unit: string | null;
}

export function RequestPage() {
  const [title, setTitle] = React.useState("");
  const [requesterName, setRequesterName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [participants, setParticipants] = React.useState<PublicParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    listParticipantsPublic()
      .then(setParticipants)
      .catch(() => {})
      .finally(() => setParticipantsLoading(false));
  }, []);

  const filtered = search.trim()
    ? participants.filter(
        (p) =>
          p.name.includes(search) ||
          (p.role ?? "").includes(search) ||
          (p.unit ?? "").includes(search)
      )
    : participants;

  function toggleParticipant(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const canSubmit = title.trim().length > 0 && requesterName.trim().length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDiscussionRequest({
        title,
        requesterName,
        notes: notes || undefined,
        participantIds: selectedIds,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה, נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <Compass size={18} />
        </div>
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-[11px] text-muted-foreground">בקשת הוספת דיון</p>
        </div>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8">
        {submitted ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <CheckCircle2 size={56} className="text-green-500" />
            <h2 className="text-xl font-bold">הבקשה נשלחה בהצלחה!</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              הבקשה שלך התקבלה ותיבדק בקרוב. לאחר האישור הדיון יתווסף למערכת.
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTitle("");
                setRequesterName("");
                setNotes("");
                setSelectedIds([]);
                setSubmitted(false);
              }}
            >
              שליחת בקשה נוספת
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">בקשת הוספת דיון</h2>
              <p className="text-sm text-muted-foreground">
                מלא את הפרטים ואנחנו נבדוק את הבקשה בהקדם.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="req-title">שם הדיון *</Label>
                <Input
                  id="req-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="לדוגמה: דיון מבצעי שבועי"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="req-name">שם מבקש *</Label>
                <Input
                  id="req-name"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="שמך המלא"
                />
              </div>

              <div>
                <Label htmlFor="req-notes">הערות / סיבה לבקשה</Label>
                <Textarea
                  id="req-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="מדוע נדרש הדיון? נושא, רקע..."
                  rows={3}
                />
              </div>

              <div>
                <Label>משתתפים מוצעים</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, תפקיד..."
                  className="mb-2"
                />
                {participantsLoading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    טוען משתתפים...
                  </div>
                ) : (
                  <Card className="p-0 overflow-hidden max-h-64 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">לא נמצאו משתתפים</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {filtered.map((p) => {
                          const checked = selectedIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleParticipant(p.id)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 text-right transition-colors",
                                checked ? "bg-accent/10" : "hover:bg-muted/50"
                              )}
                            >
                              <Avatar name={p.name} size="xs" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{p.name}</div>
                                {p.role && (
                                  <div className="text-xs text-muted-foreground truncate">{p.role}</div>
                                )}
                              </div>
                              <div
                                className={cn(
                                  "h-4 w-4 rounded border-2 shrink-0 transition-colors",
                                  checked
                                    ? "bg-accent border-accent"
                                    : "border-muted-foreground/40"
                                )}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                )}
                {selectedIds.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {selectedIds.length} משתתפים נבחרו
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  שולח...
                </span>
              ) : (
                "שלח בקשה"
              )}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
