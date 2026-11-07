import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Square, Minus, GripHorizontal, Bot, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentInfo } from "@/lib/agentsky/client";
import { getSpeech, microphoneRecording, transcribeRecording } from "@/lib/audio/voiceClient";
import { speechText } from "@/lib/audio/voiceSchema";
import { type HubLang } from "./HubParts";
import type { AgentVoiceSettings } from "@/lib/audio/agentVoice";
import { useVoiceChoice } from "./VoiceControls";
import "@/styles/floating-call.css";
import { clampCallPosition } from "@/lib/audio/callPosition";

/** Automatic speech-ended turns, authenticated transcription and Cartesia playback. */
export function VoiceCallBar({ agent, lang, busy, lastReply, replyId, onSay, onEnd, settings, agentIds, replyError }: {
  replyError?: string | null; replyId?: string; settings: AgentVoiceSettings; agentIds: string[]; agent: AgentInfo; lang: HubLang; busy: boolean; lastReply: string; onSay: (text: string) => void; onEnd: () => void;
}) {
  const ar = lang === "ar";
  const choice = useVoiceChoice(ar ? "ar" : "en", agent.id, agentIds, settings);
  const [muted, setMuted] = useState(false);
  const [phase, setPhase] = useState<"ready" | "listening" | "thinking" | "speaking">("ready");
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const position = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const alive = useRef(true);
  const recording = useRef<{ stop: () => void } | null>(null);
  const starting = useRef(false);
  const discarded = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const spoken = useRef(replyId || lastReply);
  const awaited = useRef(busy);
  const baselineError = useRef(replyError);
  const generating = useRef(false);
  const resumePlayback = useRef(false);
  const recordLatest = useRef<() => Promise<void>>(async () => {});

  const stopAudio = () => {
    abort.current?.abort(); player.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; recording.current?.stop(); stopAudio(); }; }, []);

  const record = async () => {
    if (phase === "listening") { recording.current?.stop(); return; }
    if (starting.current || muted || busy) return;
    starting.current = true; discarded.current = false; stopAudio(); setError("");
    try {
      const take = await microphoneRecording({ autoStop: true });
      if (!alive.current) { take.stop(); return; }
      recording.current = take; setPhase("listening");
      const blob = await take.result;
      if (!alive.current) return;
      if (discarded.current) { recording.current = null; setPhase("ready"); return; }
      recording.current = null; setPhase("thinking");
      const controller = new AbortController(); abort.current = controller;
      const text = await transcribeRecording(blob, choice.language, controller.signal);
      if (alive.current && !discarded.current) { spoken.current = replyId || lastReply; baselineError.current = replyError; awaited.current = true; onSay(text); }
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : "Recording unavailable"); setPhase("ready"); } }
    finally { starting.current = false; }
  };

  recordLatest.current = record;
  useEffect(() => {
    if (phase !== "ready" || muted || busy || error || choice.error || !choice.voiceId || awaited.current) return;
    const timer = setTimeout(() => void recordLatest.current(), 250);
    return () => clearTimeout(timer);
  }, [phase, muted, busy, error, choice.error, choice.voiceId]);

  useEffect(() => {
    if (busy) { baselineError.current = replyError; awaited.current = true; if (!generating.current) setPhase("thinking"); return; }
    if (replyError && replyError !== baselineError.current) { awaited.current = false; stopAudio(); setError(replyError); setPhase("ready"); return; }
    if (!awaited.current || generating.current) return;
    if (!lastReply || (replyId || lastReply) === spoken.current) return;
    if (!choice.voiceId) { if (choice.error) { setError(choice.error); setPhase("ready"); } return; }
    awaited.current = false; spoken.current = replyId || lastReply; generating.current = true;
    stopAudio(); const controller = new AbortController(); abort.current = controller;
    setPhase("thinking"); setError("");
    void (async () => {
      try {
        const blob = await getSpeech(speechText(lastReply), choice.voiceId, choice.language, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        audioUrl.current = URL.createObjectURL(blob);
        const audio = player.current; if (!audio) return;
        audio.src = audioUrl.current;
        audio.onended = () => { if (alive.current) { stopAudio(); setPhase("ready"); } };
        audio.onerror = () => { if (alive.current) { stopAudio(); setError(ar ? "تعذر تشغيل الرد الصوتي" : "Could not play the reply."); setPhase("ready"); } };
        try { await audio.play(); if (alive.current) setPhase("speaking"); }
        catch { resumePlayback.current = true; setError(ar ? "اضغط لتشغيل الرد الصوتي" : "Tap to play the voice reply"); setPhase("ready"); }
      } catch (e) { if (alive.current && !controller.signal.aborted) { setError(e instanceof Error ? e.message : "Audio unavailable"); setPhase("ready"); } }
      finally { generating.current = false; }
    })();
  }, [busy, lastReply, replyId, replyError, choice.voiceId, choice.error]);

  useLayoutEffect(() => {
    const el = position.current, parent = el?.parentElement;
    if (!el || !parent) return;
    const fit = () => {
      const next = clampCallPosition(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight, parent.clientWidth, parent.clientHeight);
      el.style.left = `${next.x}px`; el.style.top = `${next.y}px`; el.style.right = "auto";
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(parent);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener("resize", fit); };
  }, [minimized]);

  return <div ref={position} className="cx-call cx-call-cartesia" data-minimized={minimized} role="dialog" aria-label={ar ? "مكالمة صوتية" : "Voice call"}>
    <audio ref={player} playsInline preload="auto" />
    <div className="cx-call-drag" aria-label="Move call" onPointerDown={(e) => {
      const el = position.current; if (!el) return;
      drag.current = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop }; e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={(e) => {
      const start = drag.current, el = position.current, parent = el?.parentElement; if (!start || !el || !parent) return;
      const next = clampCallPosition(start.left + e.clientX - start.x, start.top + e.clientY - start.y, el.offsetWidth, el.offsetHeight, parent.clientWidth, parent.clientHeight);
      el.style.left = `${next.x}px`; el.style.top = `${next.y}px`; el.style.right = "auto";
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><GripHorizontal size={18} /></div>
    {minimized ? <Button variant="ghost" size="icon" className="cx-call-restore" aria-label="Restore call" title={error || phase} onClick={() => setMinimized(false)}><Bot size={30} /></Button> : <>
      <span className="cx-call-avatar" data-phase={phase}><Bot size={36} /></span>
      <div className="cx-call-content">
        <span role="status">{phase === "listening" ? (ar ? "بسمعك" : "Listening") : phase === "thinking" ? (ar ? "جاري الرد" : "Processing") : phase === "speaking" ? (ar ? "بيتكلم" : "Speaking") : muted ? (ar ? "الميكروفون مقفول" : "Muted") : (ar ? "جاهز" : "Ready")}</span>
        {(error || choice.error) && <span role="alert">{error || choice.error}</span>}
      </div>
      <div className="cx-call-actions">
        {resumePlayback.current ? <Button variant="ghost" size="icon" className="cx-call-btn" aria-label="Play voice reply" onClick={() => { void player.current?.play().then(() => { resumePlayback.current = false; setError(""); setPhase("speaking"); }).catch(() => setError(ar ? "تعذر تشغيل الصوت" : "Audio playback unavailable")); }}><Play size={18} /></Button> : <Button variant="ghost" size="icon" className="cx-call-btn" disabled={busy || phase === "thinking"} aria-label={phase === "listening" ? "Stop recording" : muted ? "Unmute" : "Mute"} onClick={() => {
          if (phase === "listening") { recording.current?.stop(); return; }
          if (!muted) { discarded.current = true; recording.current?.stop(); setMuted(true); }
          else { discarded.current = false; setError(""); choice.reload(); setMuted(false); setPhase("ready"); }
        }}>{phase === "listening" ? <Square size={17} /> : muted ? <MicOff size={18} /> : <Mic size={18} />}</Button>}
        <Button variant="ghost" size="icon" className="cx-call-btn cx-call-end" aria-label={ar ? "إنهاء المكالمة" : "End call"} onClick={() => { discarded.current = true; alive.current = false; recording.current?.stop(); stopAudio(); onEnd(); }}><PhoneOff size={18} /></Button>
        <Button variant="ghost" size="icon" className="cx-call-btn" aria-label="Minimize call" title="Minimize call" onClick={() => setMinimized(true)}><Minus size={18} /></Button>
      </div>
    </>}
  </div>;
}
