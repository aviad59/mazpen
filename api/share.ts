// Vercel serverless function — serves dynamic OG tags for social crawlers
// and redirects real users to the SPA with the discussion pre-selected.
// URL: /api/share?id=<discussionId>&name=<encodedName>

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CRAWLER_AGENTS = [
  "facebookexternalhit",
  "whatsapp",
  "twitterbot",
  "linkedinbot",
  "telegrambot",
  "slackbot",
  "ia_archiver",
  "googlebot",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function handler(req: any, res: any) {
  const id = String(req.query?.id ?? "");
  const rawName = String(req.query?.name ?? "");
  const name = (() => { try { return decodeURIComponent(rawName); } catch { return rawName; } })();

  const ua = String(req.headers?.["user-agent"] ?? "").toLowerCase();
  const isCrawler = CRAWLER_AGENTS.some((a) => ua.includes(a));

  const host = String(req.headers?.host ?? "");
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  if (!isCrawler) {
    res.redirect(302, `${origin}/?id=${encodeURIComponent(id)}`);
    return;
  }

  const title = name ? `${name} — מצפן` : "מצפן — מעקב דיונים מבצעי";
  const ogUrl = `${origin}/api/share?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="פרטי הדיון המבצעי במצפן" />
  <meta property="og:url" content="${escapeHtml(ogUrl)}" />
  <meta property="og:image" content="${escapeHtml(origin)}/icons/icon-512.jpg" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:site_name" content="מצפן" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
</head>
<body>
  <script>window.location.replace(${JSON.stringify(`${origin}/?id=${encodeURIComponent(id)}`)});</script>
  <p>מעביר לדיון...</p>
</body>
</html>`);
}
