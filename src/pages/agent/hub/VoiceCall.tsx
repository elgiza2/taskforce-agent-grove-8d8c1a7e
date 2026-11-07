import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Square, Minus, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentInfo } from "@/lib/agentsky/client";
import { getSpeech, microphoneRecording, transcribeRecording } from "@/lib/audio/voiceClient";
import { speechText } from "@/lib/audio/voiceSchema";
import { BotAvatar, type HubLang } from "./HubParts";
import type { AgentVoiceSettings } from "@/lib/audio/agentVoice";
import { useVoiceChoice } from "./VoiceControls";

/** Turn-based calls: explicit recording, authenticated transcription and Cartesia reply. */
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

  const stopAudio = () => {
    abort.current?.abort(); player.current?.pause(); player.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; recording.current?.stop(); stopAudio(); }; }, []);

  const record = async () => {
    if (phase === "listening") { recording.current?.stop(); return; }
    if (starting.current || muted || busy) return;
    starting.current = true; discarded.current = false; stopAudio(); setError("");
    try {
      const take = await microphoneRecording();
      if (!alive.current) { take.stop(); return; }
      recording.current = take; setPhase("listening");
      const blob = await take.result;
      if (!alive.current) return;
      if (discarded.current) { recording.current = null; setPhase("ready"); return; }
      recording.current = null; setPhase("thinking");
      const controller = new AbortController(); abort.current = controller;
      const text = await transcribeRecording(blob, choice.language, controller.signal);
      if (alive.current && !discarded.current) { spoken.current = replyId || lastReply; awaited.current = true; onSay(text); }
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : "Recording unavailable"); setPhase("ready"); } }
    finally { starting.current = false; }
  };

  useEffect(() => {
    if (replyError) { awaited.current = false; stopAudio(); setError(replyError); setPhase("ready"); return; }
    if (busy) { awaited.current = true; setPhase("thinking"); return; }
    if (!awaited.current) return;
    if (!lastReply || (replyId || lastReply) === spoken.current) { setPhase("ready"); return; }
    if (!choice.voiceId) return;
    awaited.current = false; spoken.current = replyId || lastReply;
    stopAudio(); const controller = new AbortController(); abort.current = controller;
    setPhase("thinking"); setError("");
    void (async () => {
      try {
        if (!choice.voiceId) throw new Error(choice.error || "Choose a Cartesia voice first.");
        const blob = await getSpeech(speechText(lastReply), choice.voiceId, choice.language, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        audioUrl.current = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl.current); player.current = audio;
        audio.onended = () => { if (alive.current) { stopAudio(); setPhase("ready"); } };
        audio.onerror = () => { if (alive.current) { stopAudio(); setError("Could not play the reply."); setPhase("ready"); } };
        await audio.play(); if (alive.current) setPhase("speaking");
      } catch (e) { if (alive.current && !controller.signal.aborted) { setError(e instanceof Error ? e.message : "Audio unavailable"); setPhase("ready"); } }
    })();
  }, [busy, lastReply, replyId, replyError, choice.voiceId]); // voice choices apply to the next reply

  return <div ref={position} className="cx-call cx-call-cartesia" data-minimized={minimized} role="dialog" aria-label={ar ? "مكالمة صوتية" : "Voice call"}>
    <div className="cx-call-drag" aria-label="Move call" onPointerDown={(e) => {
      const bounds = position.current?.getBoundingClientRect(); if (!bounds) return;
      drag.current = { x: e.clientX, y: e.clientY, left: bounds.left, top: bounds.top }; e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={(e) => {
      const start = drag.current, el = position.current; if (!start || !el) return;
      el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, start.left + e.clientX - start.x))}px`;
      el.style.top = `${Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, start.top + e.clientY - start.y))}px`;
      el.style.right = "auto";
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><GripHorizontal size={18} /></div>
    {minimized ? <Button variant="ghost" size="icon" className="cx-call-restore" aria-label="Restore call" title={error || phase} onClick={() => setMinimized(false)}><BotAvatar agent={agent} size={40} state={phase === "speaking" ? "talking" : "idle"} /></Button> : <>
    <BotAvatar agent={agent} size={44} state={phase === "speaking" ? "talking" : phase === "thinking" ? "thinking" : "idle"} />
    <div className="cx-call-content">
      <span role="status">{phase === "listening" ? (ar ? "جاري التسجيل" : "Recording") : phase === "thinking" ? (ar ? "جاري الرد" : "Processing") : phase === "speaking" ? (ar ? "بيتكلم" : "Speaking") : (ar ? "جاهز" : "Ready")}</span>
      {(error || choice.error) && <span role="alert">{error || choice.error}</span>}
    </div>
    <Button variant="ghost" size="icon" className="cx-call-btn" disabled={muted || busy || phase === "thinking"} aria-label={phase === "listening" ? "Stop recording" : "Record voice message"} title={phase === "listening" ? "Stop recording" : "Record voice message"} onClick={() => void record()}>{phase === "listening" ? <Square size={18} /> : <Mic size={19} />}</Button>
    <Button variant="ghost" size="icon" className="cx-call-btn" data-off={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={() => { if (!muted) { discarded.current = true; recording.current?.stop(); abort.current?.abort(); awaited.current = false; setPhase("ready"); } setMuted((m) => !m); }}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</Button>
    <Button variant="ghost" size="icon" className="cx-call-btn cx-call-end" aria-label={ar ? "إنهاء المكالمة" : "End call"} onClick={onEnd}><X size={20} /></Button>
    <Button variant="ghost" size="icon" className="cx-call-btn" aria-label="Minimize call" title="Minimize call" onClick={() => setMinimized(true)}><Minus size={18} /></Button>
    </>}
  </div>;
}