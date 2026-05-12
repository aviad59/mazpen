import { Database, RotateCcw } from "lucide-react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";

interface Props {
  error: string;
  onRetry: () => void;
}

/**
 * Shown when the Supabase backend is missing or unreachable.
 * Guides the user through the .env setup and offers a retry button.
 */
export function BackendErrorScreen({ error, onRetry }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <Database size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">חיבור ל-DB נדרש</h1>
            <p className="text-xs text-muted-foreground">
              מצפן עובד מול Supabase (Postgres אמיתי)
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>

        <div className="text-sm space-y-3 leading-relaxed">
          <p className="text-foreground/80">
            כדי להפעיל את המערכת, יש להגדיר את החיבור ל-Supabase:
          </p>
          <ol className="list-decimal pr-5 space-y-1.5 text-foreground/80">
            <li>
              צור פרויקט חינמי ב-
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                supabase.com
              </a>
              {" "}או הקם Supabase self-hosted.
            </li>
            <li>
              ב-<span dir="ltr" className="font-mono text-xs bg-muted px-1 rounded">SQL Editor</span>{" "}
              הרץ את הסקריפט{" "}
              <span dir="ltr" className="font-mono text-xs bg-muted px-1 rounded">
                supabase/schema.sql
              </span>
              .
            </li>
            <li>
              העתק את ה-Project URL ואת ה-anon key מ-Project Settings → API.
            </li>
            <li>
              צור קובץ <span dir="ltr" className="font-mono text-xs bg-muted px-1 rounded">.env</span>{" "}
              בשורש הפרויקט:
            </li>
          </ol>
          <pre
            dir="ltr"
            className="bg-muted text-foreground rounded-lg p-3 text-[11px] overflow-x-auto"
          >
{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
          </pre>
          <p className="text-foreground/80">
            ולאחר מכן הפעל מחדש את <span dir="ltr" className="font-mono text-xs bg-muted px-1 rounded">npm run dev</span>.
          </p>
        </div>

        <Button onClick={onRetry} className="w-full">
          <RotateCcw size={14} />
          נסה שוב
        </Button>
      </Card>
    </div>
  );
}
