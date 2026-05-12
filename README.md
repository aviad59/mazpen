# מצפן — Matzpen Commander

מערכת מעקב דיונים מבצעית, ניידת תחילה, לארגוני פיקוד סגורים. מעקב לפני תזמון — המטרה היא שאף דיון לא יישכח, ולא להחליף יומן.

## למה זה לא יומן

* יומן מתזמן. מצפן עוקב.
* היומן רואה זמנים. מצפן רואה **סטטוסים**: מה ממתין לתיאום, מה נכתב, מה אושר, מה הופץ.
* היומן מציג חודש. מצפן שם בראש המסך את מה שהכי דחוף לטפל בו עכשיו — דיונים **בלי תאריך**.

## טכנולוגיה

* React 18 + TypeScript + Vite
* Tailwind CSS עם CSS variables ל-theming
* רכיבים בסגנון shadcn/ui — מינימליים, RTL, ללא תלות חיצונית
* **Supabase (Postgres)** כ-backend — שכבת `Repository` יחידה, ב-`src/lib/supabaseRepo.ts`
* lucide-react לאייקונים

## הכרחי לפני הרצה — חיבור Supabase

מצפן עובד מול DB אמיתי בלבד. ללא הגדרת Supabase האפליקציה תציג מסך "חיבור ל-DB נדרש" ולא תפעל.

1. צור פרויקט חינמי ב-[supabase.com](https://supabase.com) — או הקם Supabase self-hosted (זה OSS).
2. ב-SQL Editor של הפרויקט הרץ את הסקריפט שב-[`supabase/schema.sql`](./supabase/schema.sql). הוא יוצר את הטבלאות `participants` ו-`discussions` ומגדיר RLS פתוח (מתאים לרשת סגורה — לפרודקשן עם אינטרנט פתוח החלף ב-policies מבוססות auth).
3. ב-Project Settings → API העתק את ה-Project URL ואת ה-anon public key.
4. צור קובץ `.env` בשורש הפרויקט (לפי [`.env.example`](./.env.example)):

   ```env
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
   ```

## הרצה

```bash
npm install
npm run dev
```

האפליקציה תיפתח על `http://localhost:5173`. בריענון ראשון, אם הטבלאות ריקות — נטענים אוטומטית 18 דיוני דוגמה ו-15 משתתפים מתוך `src/lib/seed.ts`.

לבנייה לפרודקשן:

```bash
npm run build
npm run preview
```

לבדיקת טיפוסים בלבד:

```bash
npm run lint
```

## החלפה ל-backend אחר

`src/lib/repo.ts` מגדיר את ה-`Repository` interface. כדי להחליף ל-PocketBase, REST API פרטי, או Firebase — כתוב adapter חדש שמממש את אותו interface ועדכן את `getRepo()`.

## מבנה התיקיות

```
src/
├── App.tsx                    # שלד האפליקציה: TopBar / Tabs / Sheets
├── main.tsx                   # נקודת כניסה
├── index.css                  # Tailwind + CSS variables + RTL
├── vite-env.d.ts              # typing למשתני סביבה
├── types/
│   └── index.ts               # Discussion, Participant, HistoryEvent...
├── lib/
│   ├── repo.ts                # Repository interface + isBackendConfigured + getRepo
│   ├── supabaseRepo.ts        # Supabase adapter (Postgres)
│   ├── db.ts                  # facade דק לרכיבים: import { listDiscussions } from "@/lib/db"
│   ├── seed.ts                # 18 דיוני דוגמה + 15 משתתפים
│   ├── he.ts                  # כל המחרוזות בעברית
│   └── utils.ts               # cn, formatHebrewDate
├── store/
│   └── useStore.ts            # store on useSyncExternalStore + פעולות + error state
└── components/
    ├── ui/                    # פרימיטיבים: Button, Card, Sheet, Chip...
    ├── Dashboard.tsx          # לוח מבצעי מחולק לסקציות
    ├── DiscussionCard.tsx     # כרטיס דיון
    ├── DiscussionDetail.tsx   # מסך פרטים + ציר זמן + revert
    ├── DiscussionEditForm.tsx # טופס עריכה
    ├── QuickAddSheet.tsx      # יצירה מהירה
    ├── DateQuickPicker.tsx    # chips: היום/מחר/יום ראשון הבא…
    ├── SearchView.tsx         # חיפוש וסינון גלובלי
    ├── ArchiveView.tsx        # דיונים שהושלמו / בוטלו
    ├── BackendErrorScreen.tsx # מסך הגדרת Supabase
    ├── TopBar.tsx
    ├── BottomNav.tsx
    └── ActivityTimeline.tsx

supabase/
└── schema.sql                 # סכימת DB + RLS פתוח
```

## מחזור החיים של דיון

```
ממתין לתיאום ──▶ מתוזמן ──▶ התקיים ──▶ ממתין לסיכום
                                              │
                                              ▼
                              ממתין לאישור ──▶ ממתין להפצה ──▶ הושלם
```

לכל סטטוס יש כפתור "קדימה" וכפתור "חזרה אחורה" — אפשר לתקן טעויות. בתוך מצב עריכה יש Select שמאפשר קפיצה לכל סטטוס, כולל ביטול.

לא כל דיון עובר את כל השלבים — בדגלים `requiresSummary` / `requiresApproval` / `requiresDistribution` אפשר לבחור איזה שלבים נדרשים.

## עקרונות עיצוב

* **Mobile-first.** ה-Bottom Nav, ה-FAB באמצע, וה-Sheet שעולה מלמטה — הכל מתוכנן ליד אחת.
* **ראייה מעל תזמון.** "ממתינים לתיאום" תמיד בראש, עם ספירה אדומה ב-TopBar.
* **תאריך, לא שעה.** דיון מקבל תאריך בלבד — chips ל"היום", "מחר", "יום שלישי", "ראשון הבא" וכו'.
* **מינימום הקלדה.** יצירת דיון = שם + דורש בלבד.
* **מעקב מובנה.** כל שינוי סטטוס/תאריך/משתתפים/סיכום מתועד ב-`history`.

## הרחבות מומלצות (לא מומשו עדיין)

* Realtime subscriptions ב-Supabase כדי שמזכירות מרובות יראו עדכונים מיידית
* התראות Push לדיונים שלא קיבלו טיפול תוך X שעות
* ייצוא סיכום ל-DOCX/PDF
* Supabase auth + RLS מבוסס-משתמש לפני חשיפה מחוץ לרשת סגורה
