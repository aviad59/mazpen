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
* IndexedDB לשכבת אחסון מקומית (offline-first)
* lucide-react לאייקונים

## התקנה והרצה

```bash
npm install
npm run dev
```

האפליקציה תיפתח על `http://localhost:5173`. הנתונים נשמרים מקומית ב-IndexedDB של הדפדפן.

לבנייה לפרודקשן:

```bash
npm run build
npm run preview
```

לבדיקת טיפוסים בלבד:

```bash
npm run lint
```

## מבנה התיקיות

```
src/
├── App.tsx                  # שלד האפליקציה: TopBar / Tabs / Sheets
├── main.tsx                 # נקודת כניסה
├── index.css                # Tailwind + CSS variables + RTL
├── types/
│   └── index.ts             # Discussion, Participant, HistoryEvent...
├── lib/
│   ├── db.ts                # מעטפת IndexedDB
│   ├── seed.ts              # 18 דיוני דוגמה + 15 משתתפים
│   ├── he.ts                # כל המחרוזות בעברית
│   └── utils.ts             # cn, formatHebrewDate, isSoon...
├── store/
│   └── useStore.ts          # store on useSyncExternalStore + פעולות
└── components/
    ├── ui/                  # פרימיטיבים: Button, Card, Sheet, Chip...
    ├── Dashboard.tsx        # לוח מבצעי מחולק לסקציות
    ├── DiscussionCard.tsx   # כרטיס דיון
    ├── DiscussionDetail.tsx # מסך פרטים + עריכה + ציר זמן
    ├── QuickAddSheet.tsx    # יצירה מהירה
    ├── SearchView.tsx       # חיפוש וסינון גלובלי
    ├── ArchiveView.tsx      # דיונים שהושלמו / בוטלו
    ├── TopBar.tsx
    ├── BottomNav.tsx
    └── ActivityTimeline.tsx
```

## מחזור החיים של דיון

```
ממתין לתיאום ──▶ מתוזמן ──▶ התקיים ──▶ ממתין לסיכום
                                              │
                                              ▼
                              ממתין לאישור ──▶ ממתין להפצה ──▶ הושלם
```

לא כל דיון עובר את כל השלבים — בדגלים `requiresSummary` / `requiresApproval` / `requiresDistribution` אפשר לבחור איזה שלבים נדרשים. למשל "תדריך בוקר" עובר ישר מ"מתוזמן" ל"הושלם".

## עקרונות עיצוב

* **Mobile-first.** ה-Bottom Nav, ה-FAB באמצע, וה-Sheet שעולה מלמטה — הכל מתוכנן ליד אחת. ה-UI מתאים את עצמו ל-`max-w-xl` בדסקטופ אבל לא הופך ל-Kanban.
* **ראייה מעל תזמון.** "ממתינים לתיאום" תמיד בראש, עם ספירה אדומה ב-TopBar. דיונים ללא תאריך מקבלים `ring` אדום וטקסט אדום.
* **מינימום הקלדה.** יצירת דיון = שם + דורש בלבד. כל השאר אופציונלי. בחירת משתתפים אוטוקומפליט מעל ספריה. עדיפות = chips. תאריך = optional.
* **מעקב מובנה.** כל שינוי סטטוס/תאריך/משתתפים/סיכום מתועד אוטומטית ב-`history` ומופיע בציר הזמן של הדיון.

## נתוני דוגמה

באתחול ראשון נטענים 18 דיונים ו-15 משתתפים פרושים על כל שלבי המחזור. ניתן לאפס בכל עת דרך כפתור הסיבוב ב-TopBar.

## הרחבות מומלצות (לא מומשו עדיין)

* התראות Push לדיונים שלא קיבלו טיפול תוך X שעות
* ייצוא סיכום ל-DOCX/PDF
* סנכרון לשרת (השכבה של `db.ts` כבר בנויה כשכבת abstraction להחלפה קלה)
* תמיכה ב-offline-installable PWA — `index.html` ו-`vite.config.ts` קרובים לכך
