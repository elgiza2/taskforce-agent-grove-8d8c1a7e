import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentInfo } from "@/lib/agentsky/client";
import { getSpeech, microphoneRecording, transcribeRecording } from "@/lib/audio/voiceClient";
import { speechText } from "@/lib/audio/voiceSchema";
import { BotAvatar, type HubLang } from "./HubParts";
import { useVoiceChoice, VoiceChoice } from "./VoiceControls";

/** Turn-based calls: explicit recording, authenticated transcription and Cartesia reply. */
export function VoiceCallBar({ agent, lang, busy, lastReply, onSay, onEnd }: {
  agent: AgentInfo; lang: HubLang; busy: boolean; lastReply: string; onSay: (text: string) => void; onEnd: () => void;
}) {
  const ar = lang === "ar";
  const choice = useVoiceChoice(ar ? "ar" : "en");
  const [muted, setMuted] = useState(false);
  const [phase, setPhase] = useState<"ready" | "listening" | "thinking" | "speaking">("ready");
  const [error, setError] = useState("");
  const alive = useRef(true);
  const recording = useRef<{ stop: () => void } | null>(null);
  const starting = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const spoken = useRef(lastReply);
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
    starting.current = true; stopAudio(); setError("");
    try {
      const take = await microphoneRecording();
      if (!alive.current) { take.stop(); return; }
      recording.current = take; setPhase("listening");
      const blob = await take.result;
      if (!alive.current) return;
      recording.current = null; setPhase("thinking");
      const controller = new AbortController(); abort.current = controller;
      const text = await transcribeRecording(blob, choice.language, controller.signal);
      if (alive.current) { awaited.current = true; onSay(text); }
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : "Recording unavailable"); setPhase("ready"); } }
    finally { starting.current = false; }
  };

  useEffect(() => {
    if (busy) { awaited.current = true; setPhase("thinking"); return; }
    if (!awaited.current) return;
    if (!lastReply || lastReply === spoken.current) { setPhase("ready"); return; }
    awaited.current = false; spoken.current = lastReply;
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
  }, [busy, lastReply]); // voice choices apply to the next reply

  return <div className="cx-call cx-call-cartesia" role="dialog" aria-label={ar ? "مكالمة صوتية" : "Voice call"}>
    <BotAvatar agent={agent} size={44} state={phase === "speaking" ? "talking" : phase === "thinking" ? "thinking" : "idle"} />
    <div className="cx-call-content"><VoiceChoice choice={choice} />
      <span role="status">{phase === "listening" ? (ar ? "جاري التسجيل" : "Recording") : phase === "thinking" ? (ar ? "جاري الرد" : "Processing") : phase === "speaking" ? (ar ? "بيتكلم" : "Speaking") : (ar ? "جاهز" : "Ready")}</span>
      {(error || choice.error) && <span role="alert">{error || choice.error}</span>}
    </div>
    <Button variant="ghost" size="icon" className="cx-call-btn" disabled={muted || busy || phase === "thinking"} aria-label={phase === "listening" ? "Stop recording" : "Record voice message"} title={phase === "listening" ? "Stop recording" : "Record voice message"} onClick={() => void record()}>{phase === "listening" ? <Square size={18} /> : <Mic size={19} />}</Button>
    <Button variant="ghost" size="icon" className="cx-call-btn" data-off={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={() => { if (!muted) recording.current?.stop(); setMuted((m) => !m); }}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</Button>
    <Button variant="ghost" size="icon" className="cx-call-btn cx-call-end" aria-label={ar ? "إنهاء المكالمة" : "End call"} onClick={onEnd}><X size={20} /></Button>
  </div>;
}