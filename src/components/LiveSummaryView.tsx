import * as React from "react";
import { AlertTriangle, Flag, Loader2, Mic, Pencil, Plus, RotateCcw, Save, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { useStore } from "@/store/useStore";
import { AudioChunker, type AudioChunk } from "@/lib/audioChunker";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { Switch } from "./ui/Switch";
import { DiscussionPicker } from "./DiscussionPicker";
import { Input, Label, Textarea } from "./ui/Input";
import type { DiscussionStatus } from "@/types";

/* ------------------------------------------------------------------ */
/* Minimal Web Speech API typings (not in lib.dom)                     */
/* ------------------------------------------------------------------ */

interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative; length: number }
interface SpeechResultEvent { resultIndex: number; results: { length: number; [i: number]: SpeechResult } }
interface SpeechErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ */

/**
 * A transcript line. `src` tells where it came from:
 *  - "ai":      Gemini transcription of an audio chunk (accurate, Hebrew + English)
 *  - "browser": the browser's built-in speech recognition (fallback)
 *  - "manual":  a note typed by the scribe during the discussion
 *  - "marker":  "the senior's closing summary starts here"
 */
interface Segment {
  at: string;
  text: string;
  src?: "ai" | "browser" | "manual" | "marker";
  /** Browser text already cleaned up by Claude (polish-transcript). */
  polished?: boolean;
}
/** Browser-recognized lines that Claude hasn't cleaned up yet. */
const needsPolish = (s: Segment) => (s.src === "browser" || s.src === undefined) && !s.polished && !!s.text.trim();
const POLISH_BATCH = 150;
interface Draft { segments: Segment[]; summary: string; senior?: string }

const MARKER_TEXT = "=== מכאן: סיכום הבכיר ===";
/** How manual notes are shown in the whole-transcript editor. */
const NOTE_PREFIX = "[הערה] ";

/** Transcript as sent to the summarizer — manual notes and the senior marker are labeled. */
function transcriptForAI(segments: Segment[]): string {
  return segments
    .map((s) => (s.src === "marker" ? MARKER_TEXT : s.src === "manual" ? `[הערה ידנית] ${s.text}` : s.text))
    .join("\n");
}
const isSpeech = (s: Segment) => s.src !== "manual" && s.src !== "marker";

interface Job {
  session: number;
  seq: number;
  startMs: number;
  endMs: number;
  audio: string;
  tries: number;
}

const DRAFT_KEY = (id: string) => `live-summary-draft:${id}`;
const VOCAB_KEY = "live-summary-vocab";
/** Gemini audio transcription: off unless the user turns it on (needs a paid Gemini quota). */
const ENGINE_KEY = "live-summary-gemini-audio";
/** Browser results arrive a little after the words were spoken. */
const PREVIEW_LAG_MS = 1500;
/** Chunks with less detected speech than this are not sent (avoids hallucinations on silence). */
const MIN_VOICED_MS = 150;
/** ...and only when nothing in the chunk was louder than this (so quiet / distant speakers are still sent). */
const SILENT_PEAK_RMS = 0.003;
const MAX_PARALLEL = 2;
/** Mobile browsers often can't share the mic between recognition and recording. */
const IS_MOBILE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Statuses for which a live summary makes sense. */
const ELIGIBLE: DiscussionStatus[] = ["new", "coordinated", "occurred", "waiting_summary", "waiting_approval"];
/** Statuses that move to waiting_approval once a summary is saved. */
const ADVANCE_FROM: DiscussionStatus[] = ["new", "coordinated", "occurred", "waiting_summary"];

function loadDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(id: string, d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY(id), JSON.stringify(d));
  } catch { /* storage unavailable — draft just isn't persisted */ }
}
function clearDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_KEY(id));
  } catch { /* ignore */ }
}
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function bySegmentTime(a: Segment, b: Segment) {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

/** Pulls the function's own `{ error, code }` out of a supabase-js FunctionsHttpError. */
async function functionError(err: unknown): Promise<{ message: string; code?: string }> {
  let message = err instanceof Error ? err.message : String(err);
  let code: string | undefined;
  try {
    const ctx = (err as { context?: Response }).context;
    const j = ctx ? await ctx.json() : null;
    if (j?.error) message = j.error;
    if (j?.code) code = j.code;
  } catch { /* keep generic message */ }
  return { message, code };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function LiveSummaryView() {
  const { discussions, lookupParticipant, updateDiscussion, changeStatus } = useStore();
  const browserSupported = React.useMemo(() => getRecognitionCtor() !== null, []);
  const aiSupported = React.useMemo(() => AudioChunker.isSupported(), []);
  const supported = browserSupported || aiSupported;

  const eligible = React.useMemo(
    () => discussions.filter((d) => ELIGIBLE.includes(d.status)).sort((a, b) => a.name.localeCompare(b.name, "he")),
    [discussions]
  );

  const [discussionId, setDiscussionId] = React.useState<string>("");
  const discussion = discussions.find((d) => d.id === discussionId) ?? null;

  const nameOf = React.useCallback((id: string) => lookupParticipant(id)?.name, [lookupParticipant]);

  const [segments, setSegments] = React.useState<Segment[]>([]);
  /** Browser-recognized text waiting to be replaced by the AI transcription. */
  const [preview, setPreview] = React.useState<Segment[]>([]);
  const [interim, setInterim] = React.useState("");
  const [pending, setPending] = React.useState(0);
  /** Per-session AI transcription counters, shown so it's clear what the AI is doing. */
  const [stats, setStats] = React.useState({ ai: 0, empty: 0 });
  const [listening, setListening] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [useAI, setUseAI] = React.useState(() => aiSupported && readPref(ENGINE_KEY) === "1");
  const [polishing, setPolishing] = React.useState(false);
  const [vocab, setVocab] = React.useState(() => readPref(VOCAB_KEY) ?? "");
  const [senior, setSenior] = React.useState("");
  const [note, setNote] = React.useState("");
  const [failedCount, setFailedCount] = React.useState(0);
  const [retrying, setRetrying] = React.useState(false);
  /** Key (`at|src`) of the transcript line being edited. */
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  /** Whole-transcript edit mode: the text being edited, or null when off. */
  const [fullEdit, setFullEdit] = React.useState<string | null>(null);
  const failedRef = React.useRef<Job[]>([]);
  const [summary, setSummary] = React.useState("");
  const [summaryEdited, setSummaryEdited] = React.useState(false);
  const [summarizing, setSummarizing] = React.useState(false);
  const [lastSummaryAt, setLastSummaryAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);

  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const chunkerRef = React.useRef<AudioChunker | null>(null);
  const wantListeningRef = React.useRef(false);
  /** True while the current recording session sends audio to the AI transcriber. */
  const aiActiveRef = React.useRef(false);
  const wakeLockRef = React.useRef<{ release(): Promise<void> } | null>(null);
  /** Transcript length at the time of the last successful summary. */
  const summarizedLenRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const finalSummaryRef = React.useRef(false);
  const finalPolishRef = React.useRef(false);
  const transcriptEndRef = React.useRef<HTMLDivElement | null>(null);
  const levelBarRef = React.useRef<HTMLDivElement | null>(null);

  // Transcription queue
  const sessionRef = React.useRef(0);
  const queueRef = React.useRef<Job[]>([]);
  const activeJobsRef = React.useRef(0);
  const nextSeqRef = React.useRef(0);
  const doneSeqRef = React.useRef(new Set<number>());
  const jobsRef = React.useRef(new Map<number, Job>());
  /** All jobs up to (excluding) this seq are settled... */
  const watermarkSeqRef = React.useRef(0);
  /** ...and cover audio up to this time. */
  const watermarkEndRef = React.useRef(0);

  const previewRef = React.useRef<Segment[]>([]);
  const segmentsRef = React.useRef<Segment[]>([]);
  segmentsRef.current = segments;

  const transcript = React.useMemo(() => transcriptForAI(segments), [segments]);

  // Which discussions have an unsaved draft (re-read when this one's draft changes).
  const draftTick = segments.length > 0 || !!summary;
  const hasDraft = React.useCallback(
    (id: string) => {
      void draftTick;
      try {
        return !!localStorage.getItem(DRAFT_KEY(id));
      } catch {
        return false;
      }
    },
    [draftTick]
  );
  const hasMarker = segments.some((s) => s.src === "marker");

  const participantNames = React.useMemo(() => {
    if (!discussion) return [];
    const names = discussion.participantIds.map((id) => lookupParticipant(id)?.name).filter(Boolean) as string[];
    return [...names, ...(discussion.extraParticipants ?? [])];
  }, [discussion, lookupParticipant]);

  const vocabList = React.useMemo(
    () => vocab.split(/[,\n،]/).map((v) => v.trim()).filter(Boolean),
    [vocab]
  );

  /** Context passed with each audio chunk; read through a ref so in-flight callbacks see the latest. */
  const contextRef = React.useRef({ discussionName: "", participants: [] as string[], vocabulary: [] as string[] });
  contextRef.current = { discussionName: discussion?.name ?? "", participants: participantNames, vocabulary: vocabList };

  // Load draft when a discussion is selected
  React.useEffect(() => {
    if (!discussionId) return;
    const draft = loadDraft(discussionId);
    sessionRef.current++;
    setSegments(draft?.segments ?? []);
    setPreviewList([]);
    setPending(0);
    setSenior(draft?.senior ?? "");
    setNote("");
    setEditingKey(null);
    setFullEdit(null);
    setStats({ ai: 0, empty: 0 });
    failedRef.current = [];
    setFailedCount(0);
    setSummary(draft?.summary ?? "");
    setSummaryEdited(false);
    setLastSummaryAt(null);
    setSavedMsg(null);
    setError(null);
    setWarning(null);
    summarizedLenRef.current = draft?.summary ? transcriptForAI(draft.segments ?? []).length : 0;
  }, [discussionId]);

  // Persist draft so a reload / crash mid-meeting doesn't lose the transcript
  React.useEffect(() => {
    if (!discussionId) return;
    if (segments.length === 0 && !summary && !senior) return;
    saveDraft(discussionId, { segments, summary, senior });
  }, [discussionId, segments, summary, senior]);

  React.useEffect(() => writePref(VOCAB_KEY, vocab), [vocab]);

  // Keep the transcript scrolled to the bottom
  React.useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [segments.length, preview.length, interim]);

  // Warn before leaving while recording or while chunks are still being transcribed
  React.useEffect(() => {
    if (!listening && pending === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [listening, pending]);

  /* ---------------------------------------------------------------- */
  /* Transcript bookkeeping                                            */
  /* ---------------------------------------------------------------- */

  function setPreviewList(next: Segment[]) {
    previewRef.current = next;
    setPreview(next);
  }

  function addSegments(list: Segment[]) {
    if (!list.length) return;
    setSegments((prev) => [...prev, ...list].sort(bySegmentTime));
  }

  /** Moves browser-preview lines spoken in (fromMs, toMs] into the transcript. */
  function promotePreview(fromMs: number, toMs: number) {
    const take: Segment[] = [];
    const keep: Segment[] = [];
    for (const p of previewRef.current) {
      const t = Date.parse(p.at);
      (t > fromMs && t <= toMs ? take : keep).push(p);
    }
    if (!take.length) return;
    setPreviewList(keep);
    addSegments(take.map((p) => ({ ...p, src: "browser" as const })));
  }

  /**
   * Records the outcome of a chunk. `text === null` means the AI result is not
   * available, so the browser's preview for that time range is kept instead.
   */
  function settle(job: Job, text: string | null) {
    if (job.session !== sessionRef.current) return;
    if (text) {
      addSegments([{ at: new Date(job.startMs).toISOString(), text, src: "ai" }]);
      setStats((s) => ({ ...s, ai: s.ai + 1 }));
    } else {
      // No AI text (failed, skipped, or the model heard nothing): keep whatever the browser
      // caught for this stretch rather than throwing it away.
      promotePreview(job.startMs + PREVIEW_LAG_MS, job.endMs + PREVIEW_LAG_MS);
      if (text === "") setStats((s) => ({ ...s, empty: s.empty + 1 }));
    }

    // Drop preview lines once every chunk up to them has an AI result.
    doneSeqRef.current.add(job.seq);
    while (doneSeqRef.current.has(watermarkSeqRef.current)) {
      const j = jobsRef.current.get(watermarkSeqRef.current);
      if (j) watermarkEndRef.current = j.endMs;
      doneSeqRef.current.delete(watermarkSeqRef.current);
      jobsRef.current.delete(watermarkSeqRef.current);
      watermarkSeqRef.current++;
    }
    const cutoff = watermarkEndRef.current + PREVIEW_LAG_MS;
    const rest = previewRef.current.filter((p) => Date.parse(p.at) > cutoff);
    if (rest.length !== previewRef.current.length) setPreviewList(rest);

    setPending((n) => Math.max(0, n - 1));
  }

  /** One call to the transcribe-audio function. Throws an Error with an optional `code`. */
  async function callTranscribe(job: Job): Promise<string> {
    const ctx = contextRef.current;
    const previousText = segmentsRef.current
      .filter((s) => isSpeech(s) && Date.parse(s.at) < job.startMs)
      .map((s) => s.text)
      .join(" ")
      .slice(-600);
    const { data, error: fnError } = await supabase.functions.invoke("transcribe-audio", {
      body: {
        audio: job.audio,
        mimeType: "audio/wav",
        discussionName: ctx.discussionName,
        participants: ctx.participants,
        vocabulary: ctx.vocabulary,
        previousText,
      },
    });
    if (fnError) {
      const { message, code } = await functionError(fnError);
      throw Object.assign(new Error(message), { code });
    }
    return ((data as { text?: string })?.text ?? "").trim();
  }

  /** Re-sends pieces that failed earlier; on success their browser fallback text is replaced. */
  async function retryFailed() {
    const jobs = failedRef.current;
    if (!jobs.length || retrying) return;
    setRetrying(true);
    setWarning(null);
    const stillFailed: Job[] = [];
    for (const job of jobs) {
      if (job.session !== sessionRef.current) continue;
      try {
        const text = await callTranscribe(job);
        if (job.session !== sessionRef.current) continue;
        const from = job.startMs + PREVIEW_LAG_MS;
        const to = job.endMs + PREVIEW_LAG_MS;
        setSegments((prev) => {
          const kept = prev.filter((s) => {
            if (s.src !== "browser") return true;
            const t = Date.parse(s.at);
            return t <= from || t > to;
          });
          return text ? [...kept, { at: new Date(job.startMs).toISOString(), text, src: "ai" as const }].sort(bySegmentTime) : kept;
        });
      } catch (e) {
        stillFailed.push(job);
        setWarning(`ניסיון חוזר נכשל: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    failedRef.current = stillFailed;
    setFailedCount(stillFailed.length);
    setRetrying(false);
  }

  async function transcribe(job: Job): Promise<void> {
    if (!aiActiveRef.current) return settle(job, null);
    try {
      settle(job, await callTranscribe(job));
    } catch (e) {
      if (job.session !== sessionRef.current) return;
      const code = (e as { code?: string }).code;
      if (code === "not_configured") {
        fallbackToBrowser("תמלול ה-AI עוד לא מוגדר בשרת — ממשיך עם זיהוי הדיבור של הדפדפן.");
        return settle(job, null);
      }
      // A used-up daily quota won't recover by retrying — switch to the browser for this session.
      const message = e instanceof Error ? e.message : String(e);
      if (code === "rate_limited" && /per ?day|daily|retry in \d+h/i.test(message)) {
        fallbackToBrowser("המכסה היומית של Gemini נגמרה — ממשיך עם זיהוי הדיבור של הדפדפן (Claude יתקן את הטקסט בסוף).");
        return settle(job, null);
      }
      // Per-minute rate limits: back off longer and retry a few times before giving up.
      const maxTries = code === "rate_limited" ? 4 : 1;
      if (job.tries < maxTries) {
        job.tries++;
        await sleep(code === "rate_limited" ? 8000 * job.tries : 2000);
        if (job.session !== sessionRef.current) return;
        return transcribe(job);
      }
      // Keep the audio so the piece can be retried — the senior's summary is too important to lose.
      failedRef.current = [...failedRef.current, job];
      setFailedCount(failedRef.current.length);
      setWarning(`קטע מהתמלול נכשל (${e instanceof Error ? e.message : String(e)}). אפשר לנסות שוב.`);
      settle(job, null);
    }
  }

  function pumpQueue() {
    while (activeJobsRef.current < MAX_PARALLEL && queueRef.current.length) {
      const job = queueRef.current.shift()!;
      activeJobsRef.current++;
      transcribe(job).finally(() => {
        activeJobsRef.current--;
        pumpQueue();
      });
    }
  }

  function onChunk(chunk: AudioChunk) {
    const job: Job = {
      session: sessionRef.current,
      seq: nextSeqRef.current++,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      audio: chunk.wavBase64,
      tries: 0,
    };
    jobsRef.current.set(job.seq, job);
    setPending((n) => n + 1);
    const silent = chunk.voicedMs < MIN_VOICED_MS && chunk.peakRms < SILENT_PEAK_RMS;
    if (silent || !aiActiveRef.current) {
      // Truly silent (or AI unavailable) — keep whatever the browser heard, if anything.
      settle(job, null);
      return;
    }
    queueRef.current.push(job);
    pumpQueue();
  }

  /** Switches the running session to browser-only recognition (e.g. AI not configured). */
  function fallbackToBrowser(msg: string) {
    if (!aiActiveRef.current) return;
    aiActiveRef.current = false;
    setWarning(msg);
    chunkerRef.current?.stop(true);
    chunkerRef.current = null;
    if (levelBarRef.current) levelBarRef.current.style.width = "0%";
    promotePreview(-Infinity, Infinity);
    if (wantListeningRef.current && !recRef.current) {
      if (!startRecognition()) setError("לא ניתן להמשיך בתמלול — הדפדפן לא תומך בזיהוי דיבור.");
    }
  }

  function addNote() {
    const text = note.trim();
    if (!text) return;
    addSegments([{ at: new Date().toISOString(), text, src: "manual" }]);
    setNote("");
  }

  const segKey = (s: Segment) => `${s.at}|${s.src ?? ""}`;

  /** Saves an edited transcript line; an empty line is removed. */
  /** Opens the whole transcript as one editable text (paragraphs separated by a blank line). */
  function openFullEdit() {
    setEditingKey(null);
    setFullEdit(
      segments
        .map((s) => (s.src === "marker" ? MARKER_TEXT : s.src === "manual" ? `${NOTE_PREFIX}${s.text}` : s.text))
        .join("\n\n")
    );
  }

  /** Turns the edited text back into transcript lines, keeping the original times where possible. */
  function saveFullEdit() {
    if (fullEdit === null) return;
    const paras = fullEdit.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let lastMs = 0;
    const next: Segment[] = paras.map((p, i) => {
      const orig = segments[i];
      let ms = orig ? Date.parse(orig.at) : Date.now();
      if (ms <= lastMs) ms = lastMs + 1; // keep the order exactly as typed
      lastMs = ms;
      const at = new Date(ms).toISOString();
      if (p === MARKER_TEXT) return { at, text: MARKER_TEXT, src: "marker" as const };
      if (p.startsWith(NOTE_PREFIX.trim())) return { at, text: p.slice(NOTE_PREFIX.trim().length).trim(), src: "manual" as const };
      const src = orig && isSpeech(orig) ? orig.src : ("manual" as const);
      return { at, text: p, src };
    });
    setSegments(next);
    setFullEdit(null);
  }

  function commitEdit() {
    const key = editingKey;
    if (!key) return;
    const text = editText.trim();
    setSegments((prev) =>
      text ? prev.map((s) => (segKey(s) === key ? { ...s, text } : s)) : prev.filter((s) => segKey(s) !== key)
    );
    setEditingKey(null);
  }

  /** Marks "the senior's closing summary starts now". Pressing again moves the marker. */
  function markSeniorSummary() {
    // AI lines are stamped with their chunk's start, so anchor the marker just before the chunk being
    // recorded now — otherwise the senior's first sentence would sort above the marker.
    const chunker = chunkerRef.current;
    const atMs = chunker && aiActiveRef.current ? Math.min(Date.now(), chunker.currentChunkStartMs - 1) : Date.now();
    const marker: Segment = { at: new Date(atMs).toISOString(), text: MARKER_TEXT, src: "marker" };
    setSegments((prev) => [...prev.filter((s) => s.src !== "marker"), marker].sort(bySegmentTime));
  }

  /* ---------------------------------------------------------------- */
  /* Summary                                                           */
  /* ---------------------------------------------------------------- */

  const summarize = React.useCallback(
    async (opts: { force?: boolean; text?: string } = {}) => {
      if (!discussion || inFlightRef.current) return;
      const text = (opts.text ?? transcript).trim();
      if (!text) return;
      if (!opts.force && text.length <= summarizedLenRef.current) return;

      inFlightRef.current = true;
      setSummarizing(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("summarize-discussion", {
          body: { discussionName: discussion.name, participants: participantNames, seniorName: senior, transcript: text },
        });
        if (fnError) throw new Error((await functionError(fnError)).message);
        const next = (data as { summary?: string })?.summary;
        if (!next) throw new Error("לא התקבל סיכום");
        summarizedLenRef.current = text.length;
        setSummary(next);
        setSummaryEdited(false);
        setLastSummaryAt(new Date().toISOString());
      } catch (e) {
        setError(`שגיאה ביצירת הסיכום: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        inFlightRef.current = false;
        setSummarizing(false);
      }
    },
    [discussion, transcript, participantNames, senior]
  );

  // The summary is built once at the end (when recording stops) or on demand — not periodically.
  const summarizeRef = React.useRef(summarize);
  summarizeRef.current = summarize;

  /**
   * Sends the browser-recognized lines to Claude for cleanup (English words back in English,
   * misrecognitions, punctuation, names). Returns the transcript with the fixes applied, or
   * null if polishing failed (the original text is kept).
   */
  async function polishTranscript(): Promise<Segment[] | null> {
    const base = segmentsRef.current;
    const targets = base.filter(needsPolish);
    if (!targets.length || !discussion) return base;
    const ctx = contextRef.current;
    const fixed = new Map<string, { from: string; to: string }>();
    setPolishing(true);
    try {
      for (let k = 0; k < targets.length; k += POLISH_BATCH) {
        const batch = targets.slice(k, k + POLISH_BATCH);
        const { data, error: fnError } = await supabase.functions.invoke("polish-transcript", {
          body: {
            lines: batch.map((s) => s.text),
            discussionName: ctx.discussionName,
            participants: ctx.participants,
            vocabulary: ctx.vocabulary,
          },
        });
        if (fnError) {
          const { message, code } = await functionError(fnError);
          throw Object.assign(new Error(message), { code });
        }
        const lines = (data as { lines?: string[] })?.lines;
        if (!Array.isArray(lines) || lines.length !== batch.length) throw new Error("התקבלה תשובה לא תקינה");
        batch.forEach((s, j) => fixed.set(segKey(s), { from: s.text, to: lines[j] }));
      }
      // Apply to the current transcript — but never over a line the user edited meanwhile.
      const apply = (list: Segment[]) =>
        list.map((s) => {
          const f = fixed.get(segKey(s));
          return f && s.text === f.from ? { ...s, text: f.to, polished: true } : s;
        });
      setSegments((prev) => apply(prev));
      return apply(segmentsRef.current);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setWarning(
        code === "not_configured"
          ? "שיפור התמלול עם Claude עוד לא מוגדר בשרת (חסר ANTHROPIC_API_KEY)."
          : `שיפור התמלול נכשל: ${e instanceof Error ? e.message : String(e)}`
      );
      return null;
    } finally {
      setPolishing(false);
    }
  }
  const polishRef = React.useRef(polishTranscript);
  polishRef.current = polishTranscript;

  // After stopping: once every chunk is transcribed, clear leftovers, let Claude polish the
  // browser text, then run the final summary on the polished transcript.
  React.useEffect(() => {
    if (listening || finalizing || pending > 0) return;
    if (previewRef.current.length) {
      // Recording is over and all audio has been through the AI — whatever is left is a duplicate.
      setPreviewList([]);
    }
    if (finalPolishRef.current || finalSummaryRef.current) {
      const doPolish = finalPolishRef.current;
      const doSummary = finalSummaryRef.current;
      finalPolishRef.current = false;
      finalSummaryRef.current = false;
      setTimeout(async () => {
        const polished = doPolish ? await polishRef.current() : null;
        if (doSummary) summarizeRef.current(polished ? { text: transcriptForAI(polished) } : {});
      }, 300);
    }
  }, [listening, finalizing, pending]);

  /* ---------------------------------------------------------------- */
  /* Recording                                                         */
  /* ---------------------------------------------------------------- */

  async function acquireWakeLock() {
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      wakeLockRef.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch { /* not supported / denied — fine */ }
  }
  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  /** Starts the browser recognizer. In AI mode its output is only a quick preview. Returns false if unavailable. */
  function startRecognition(): boolean {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;

    const rec = new Ctor();
    rec.lang = "he-IL";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interimText = "";
      const finals: Segment[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript?.trim() ?? "";
        if (!t) continue;
        if (r.isFinal) finals.push({ at: new Date().toISOString(), text: t });
        else interimText += (interimText ? " " : "") + t;
      }
      if (finals.length) {
        if (aiActiveRef.current) setPreviewList([...previewRef.current, ...finals]);
        else addSegments(finals.map((f) => ({ ...f, src: "browser" as const })));
      }
      setInterim(interimText);
    };

    rec.onerror = (e) => {
      const fatal = e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture";
      if (aiActiveRef.current) {
        // Only a preview — if it can't run, the AI transcription carries on without it.
        if (fatal && recRef.current === rec) recRef.current = null;
        return;
      }
      if (fatal) {
        wantListeningRef.current = false;
        setError("אין הרשאה למיקרופון. אפשר גישה למיקרופון בהגדרות הדפדפן ונסה שוב.");
      } else if (e.error === "network") {
        setError("בעיית רשת בזיהוי הדיבור — מנסה להתחבר מחדש...");
      }
      // "no-speech" / "aborted" are routine; onend will restart if needed.
    };

    rec.onend = () => {
      setInterim("");
      // Browsers end recognition after silence or ~60s — restart while the user still wants to record.
      if (wantListeningRef.current && recRef.current === rec) {
        try {
          rec.start();
          return;
        } catch { /* fall through */ }
      }
      if (recRef.current === rec) recRef.current = null;
      // In browser-only mode the recognizer *is* the recording — if it's gone, so is the session.
      if (!aiActiveRef.current) {
        wantListeningRef.current = false;
        setListening(false);
        releaseWakeLock();
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      return true;
    } catch {
      recRef.current = null;
      return false;
    }
  }

  async function start() {
    if (!discussion) return;
    setError(null);
    setWarning(null);
    setSavedMsg(null);
    wantListeningRef.current = true;
    setPreviewList([]);
    watermarkSeqRef.current = nextSeqRef.current;
    watermarkEndRef.current = Date.now();
    doneSeqRef.current.clear();
    setStats({ ai: 0, empty: 0 });

    aiActiveRef.current = false;
    if (useAI && aiSupported) {
      const chunker = new AudioChunker({
        onChunk,
        // Shorter pieces = the accurate text replaces the gray draft sooner.
        minChunkMs: 4_000,
        maxChunkMs: 12_000,
        silenceCutMs: 500,
        onLevel: (level, speaking) => {
          const bar = levelBarRef.current;
          if (!bar) return;
          bar.style.width = `${Math.round(level * 100)}%`;
          bar.style.opacity = speaking ? "1" : "0.4";
        },
      });
      try {
        await chunker.start();
        chunkerRef.current = chunker;
        aiActiveRef.current = true;
      } catch (err) {
        await chunker.stop(true);
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          wantListeningRef.current = false;
          setError("אין הרשאה למיקרופון. אפשר גישה למיקרופון בהגדרות הדפדפן ונסה שוב.");
          return;
        }
        setWarning("הקלטת האודיו לתמלול AI נכשלה — משתמש בזיהוי הדיבור של הדפדפן.");
      }
    }

    // Browser recognition: the engine itself when AI is off, an instant preview when AI is on (desktop only).
    const wantRecognition = !aiActiveRef.current || !IS_MOBILE;
    const recOk = wantRecognition ? startRecognition() : false;

    if (!aiActiveRef.current && !recOk) {
      wantListeningRef.current = false;
      setError("לא ניתן להפעיל הקלטה בדפדפן הזה.");
      return;
    }
    setListening(true);
    acquireWakeLock();
  }

  async function stop() {
    wantListeningRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    rec?.stop();
    setInterim("");
    setListening(false);
    releaseWakeLock();
    if (levelBarRef.current) levelBarRef.current.style.width = "0%";

    const chunker = chunkerRef.current;
    chunkerRef.current = null;
    setFinalizing(true);
    try {
      await chunker?.stop(); // emits the last chunk
    } finally {
      setFinalizing(false);
    }
    // Final summary with everything captured, once the last chunks are transcribed
    finalPolishRef.current = true;
    if (!summaryEdited) finalSummaryRef.current = true;
  }

  // Stop recording if the view unmounts (tab switch)
  React.useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      sessionRef.current++;
      recRef.current?.abort();
      recRef.current = null;
      chunkerRef.current?.stop(true);
      chunkerRef.current = null;
      releaseWakeLock();
    };
  }, []);

  function resetSession() {
    if (!discussionId) return;
    if (!confirm("למחוק את התמלול והסיכום של הדיון הזה ולהתחיל מחדש?")) return;
    sessionRef.current++;
    queueRef.current = [];
    failedRef.current = [];
    setFailedCount(0);
    setEditingKey(null);
    setStats({ ai: 0, empty: 0 });
    clearDraft(discussionId);
    setSegments([]);
    setPreviewList([]);
    setPending(0);
    setSummary("");
    setSummaryEdited(false);
    setLastSummaryAt(null);
    setWarning(null);
    summarizedLenRef.current = 0;
  }

  async function save() {
    if (!discussion || !summary.trim()) return;
    if (discussion.summary && !confirm("לדיון כבר יש סיכום. להחליף אותו בסיכום החדש?")) return;
    setSaving(true);
    setError(null);
    try {
      await updateDiscussion(
        discussion.id,
        { summary: summary.trim() },
        { kind: "summary_changed", text: "סיכום נשמר מסיכום חי (AI)" }
      );
      if (ADVANCE_FROM.includes(discussion.status)) {
        await changeStatus(discussion.id, "waiting_approval");
      }
      clearDraft(discussion.id);
      setSavedMsg("הסיכום נשמר בדיון והועבר לאישור");
    } catch (e) {
      setError(`שמירה נכשלה: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const hasNewSinceSummary = transcript.trim().length > summarizedLenRef.current;
  const busy = listening || finalizing || pending > 0 || polishing;
  const unpolishedCount = segments.filter(needsPolish).length;

  return (
    <div className="px-4 pt-4 pb-28 space-y-4 lg:max-w-5xl lg:mx-auto lg:h-full lg:overflow-y-auto">
      <div>
        <h1 className="text-lg font-bold">סיכום חי</h1>
        <p className="text-sm text-muted-foreground">
          הקלט את הדיון. כשהבכיר מתחיל לסכם — לחץ "סיכום הבכיר". בסיום ההקלטה ייווצר סיכום עם המשימות.
        </p>
      </div>

      {!supported && (
        <Card className="p-4 flex gap-2 items-start border-amber-400/60">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm">
            הדפדפן הזה לא תומך בהקלטה או בזיהוי דיבור. מומלץ להשתמש ב-Chrome (מחשב או אנדרואיד) או ב-Safari מעודכן.
          </p>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium block">דיון</label>
        <DiscussionPicker
          discussions={eligible}
          value={discussionId}
          onChange={setDiscussionId}
          disabled={busy}
          nameOf={nameOf}
          hasDraft={hasDraft}
        />
        {discussion && participantNames.length > 0 && (
          <p className="text-xs text-muted-foreground">משתתפים: {participantNames.join(", ")}</p>
        )}

        {discussion && (
          <div>
            <Label htmlFor="live-senior">מסכם הדיון (הבכיר)</Label>
            <Select
              id="live-senior"
              value={senior}
              onChange={(e) => setSenior(e.target.value)}
              options={[
                { value: "", label: "לא נבחר" },
                ...participantNames.map((n) => ({ value: n, label: n })),
              ]}
            />
          </div>
        )}

        {aiSupported && (
          <div className="space-y-1">
            <Switch
              id="live-ai-engine"
              checked={useAI}
              disabled={listening}
              onChange={(v) => {
                setUseAI(v);
                writePref(ENGINE_KEY, v ? "1" : "0");
              }}
              label="תמלול אודיו עם Gemini (דורש מכסה בתשלום)"
            />
            <p className="text-xs text-muted-foreground">
              {useAI
                ? "האודיו נשלח ל-Gemini בקטעים של כמה שניות. בלי מכסה בתשלום זה נעצר אחרי כמה דקות ועובר לדפדפן."
                : "זיהוי הדיבור של הדפדפן. בסיום ההקלטה Claude מתקן את הטקסט: מילים באנגלית, שמות, ראשי תיבות ופיסוק."}
            </p>
          </div>
        )}

        {discussion && (
          <div>
            <Label htmlFor="live-vocab">מונחים, ראשי תיבות ושמות (מופרדים בפסיק)</Label>
            <Input
              id="live-vocab"
              value={vocab}
              onChange={(e) => setVocab(e.target.value)}
              placeholder='למשל: רמ"ט, deadline, Jira, מבצע אלפא'
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {!listening ? (
            <Button variant="accent" onClick={start} disabled={!supported || !discussion || finalizing || fullEdit !== null}>
              <Mic size={16} /> {segments.length ? "המשך הקלטה" : "התחל הקלטה"}
            </Button>
          ) : (
            <>
              <Button variant="destructive" onClick={stop}>
                <Square size={14} /> עצור הקלטה
              </Button>
              <Button variant={hasMarker ? "outline" : "accent"} onClick={markSeniorSummary}>
                <Flag size={16} /> {hasMarker ? "הזז את תחילת סיכום הבכיר לכאן" : "סיכום הבכיר מתחיל"}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => summarize({ force: true })}
            disabled={!discussion || !transcript.trim() || summarizing}
          >
            {summarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            סכם עכשיו
          </Button>
          {(segments.length > 0 || summary) && !busy && (
            <Button variant="ghost" onClick={resetSession}>
              <Trash2 size={16} /> התחל מחדש
            </Button>
          )}
        </div>

        {listening && (
          <div className="flex items-center gap-3 text-sm text-destructive">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            מקליט...
            {aiActiveRef.current && (
              <span className="h-1.5 w-24 rounded-full bg-muted overflow-hidden" aria-hidden>
                <span ref={levelBarRef} className="block h-full bg-emerald-500 transition-[width] duration-100" style={{ width: "0%" }} />
              </span>
            )}
          </div>
        )}
        {warning && <p className="text-sm text-amber-600">{warning}</p>}
        {failedCount > 0 && (
          <Button variant="outline" onClick={retryFailed} disabled={retrying || listening}>
            {retrying ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            תמלל שוב {failedCount} קטעים שנכשלו
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
      </Card>

      {discussion && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="text-sm font-semibold">תמלול</h2>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                {pending > 0 && (
                  <>
                    <Loader2 size={12} className="animate-spin" /> מתמלל{pending > 1 ? ` (${pending})` : ""} ·
                  </>
                )}
                {polishing && (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Claude משפר את התמלול ·
                  </>
                )}
                {segments.length} קטעים
                {fullEdit === null && unpolishedCount > 0 && !busy && (
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => void polishTranscript()}
                    title="Claude יתקן מילים באנגלית, שמות, ראשי תיבות ופיסוק"
                  >
                    <Wand2 size={12} /> שפר תמלול ({unpolishedCount})
                  </Button>
                )}
                {fullEdit === null && segments.length > 0 && !busy && (
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={openFullEdit}>
                    <Pencil size={12} /> ערוך תמלול
                  </Button>
                )}
              </span>
            </div>
            {fullEdit !== null ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  value={fullEdit}
                  onChange={(e) => setFullEdit(e.target.value)}
                  className="min-h-[40vh] lg:min-h-[55vh] resize-y"
                  aria-label="עריכת כל התמלול"
                />
                <p className="text-[11px] text-muted-foreground">
                  כל פסקה (מופרדת בשורה ריקה) היא קטע. שורה שמתחילה ב-"{NOTE_PREFIX.trim()}" נשמרת כהערה ידנית.
                </p>
                <div className="flex gap-2">
                  <Button onClick={saveFullEdit}>
                    <Save size={16} /> שמור תמלול
                  </Button>
                  <Button variant="ghost" onClick={() => setFullEdit(null)}>
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
            <div className="max-h-[40vh] lg:max-h-[55vh] overflow-y-auto space-y-1.5 text-sm">
              {segments.length === 0 && preview.length === 0 && !interim && (
                <p className="text-muted-foreground">
                  {listening && aiActiveRef.current ? "מקשיב... הטקסט יופיע אחרי ההפסקה הראשונה בדיבור." : "עוד לא נאמר דבר."}
                </p>
              )}
              {segments.map((s, i) =>
                s.src === "marker" ? (
                  <div key={i} className="flex items-center gap-2 py-1 text-xs font-semibold text-accent">
                    <span className="h-px flex-1 bg-accent/40" />
                    <Flag size={12} /> מכאן: סיכום הבכיר ({timeLabel(s.at)})
                    <span className="h-px flex-1 bg-accent/40" />
                  </div>
                ) : editingKey === segKey(s) ? (
                  <Textarea
                    key={i}
                    autoFocus
                    rows={Math.min(8, Math.max(2, Math.ceil(editText.length / 60)))}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitEdit();
                      if (e.key === "Escape") setEditingKey(null);
                    }}
                    aria-label="עריכת שורה בתמלול"
                  />
                ) : (
                  <p
                    key={i}
                    title="לחץ לעריכה"
                    onClick={() => {
                      setEditingKey(segKey(s));
                      setEditText(s.text);
                    }}
                    className={cn(
                      "leading-relaxed whitespace-pre-wrap cursor-text rounded-md hover:bg-muted/60",
                      s.src === "manual" && "bg-amber-500/10 px-2 py-1 border-r-2 border-amber-500"
                    )}
                  >
                    <span className="text-[11px] text-muted-foreground tabular-nums ml-2">{timeLabel(s.at)}</span>
                    {s.src === "manual" && <span className="text-[11px] font-medium text-amber-600 ml-1.5">הערה</span>}
                    {s.text}
                  </p>
                )
              )}
              {preview.map((s, i) => (
                <p key={`p${i}`} className="leading-relaxed text-muted-foreground" title="טיוטה — תוחלף בתמלול המדויק">
                  <span className="text-[11px] tabular-nums ml-2">{timeLabel(s.at)}</span>
                  {s.text}
                </p>
              ))}
              {interim && <p className="text-muted-foreground italic">{interim}</p>}
              <div ref={transcriptEndRef} />
            </div>
            )}
            {preview.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                טקסט באפור = טיוטה מהירה מהדפדפן. הוא מוחלף בטקסט שחור כשהתמלול המדויק של אותו קטע חוזר (כמה שניות).
              </p>
            )}
            {(stats.ai > 0 || stats.empty > 0 || pending > 0 || failedCount > 0) && (
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                תמלול AI: {stats.ai} קטעים תומללו
                {pending > 0 && ` · ${pending} בעבודה`}
                {stats.empty > 0 && ` · ${stats.empty} בלי דיבור מזוהה`}
                {failedCount > 0 && ` · ${failedCount} נכשלו`}
              </p>
            )}
            {segments.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">לחץ על שורה כדי לתקן אותה.</p>
            )}
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                addNote();
              }}
            >
              <Label htmlFor="live-note">הוספת טקסט ידני — אפשר גם בלי הקלטה</Label>
              <Textarea
                id="live-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    addNote();
                  }
                }}
                placeholder="למשל: משימה — אחראי — מועד, או כל דבר שנאמר ולא נקלט"
              />
              <Button type="submit" variant="outline" disabled={!note.trim()}>
                <Plus size={16} /> הוסף לתמלול
              </Button>
            </form>
          </Card>

          <Card className="p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles size={14} /> סיכום
              </h2>
              <span className="text-xs text-muted-foreground">
                {summarizing
                  ? "מעדכן..."
                  : summaryEdited
                    ? "נערך ידנית"
                    : lastSummaryAt
                      ? `עודכן ${timeLabel(lastSummaryAt)}${hasNewSinceSummary ? " · יש תוכן חדש" : ""}`
                      : ""}
              </span>
            </div>
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setSummaryEdited(true);
              }}
              placeholder="הסיכום (עם המשימות) ייווצר כאן כשתעצור את ההקלטה, או לחץ על 'סכם עכשיו'."
              className={cn(
                "flex-1 min-h-[40vh] lg:min-h-[55vh] w-full rounded-lg border border-input bg-card p-3 text-sm leading-relaxed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              )}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button onClick={save} disabled={!summary.trim() || saving || busy}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                שמור בדיון
              </Button>
              {summaryEdited && (
                <Button variant="ghost" onClick={() => summarize({ force: true })} disabled={summarizing}>
                  צור סיכום מחדש
                </Button>
              )}
            </div>
            {busy && (
              <p className="text-xs text-muted-foreground mt-2">
                {listening ? "עצור את ההקלטה כדי לשמור." : "ממתין לסיום התמלול..."}
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
