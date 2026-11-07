import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSpeech, getVoices } from "@/lib/audio/voiceClient";
import { speechText, type Voice } from "@/lib/audio/voiceSchema";

export function useVoiceChoice(defaultLanguage: string) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [language, setLanguage] = useState(defaultLanguage);
  const [voiceId, setVoiceId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getVoices().then((list) => { if (active) { setVoices(list); setVoiceId((list.find((v) => v.language === defaultLanguage) || list[0])?.id || ""); } }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [defaultLanguage]);
  return { voices, language, setLanguage, voiceId, setVoiceId, error };
}

export function VoiceChoice({ choice }: { choice: ReturnType<typeof useVoiceChoice> }) {
  const languages = [...new Set(["ar", "en", ...choice.voices.map((v) => v.language)])].sort();
  return <div className="cx-voice-choice">
    <select aria-label="Voice language" value={choice.language} onChange={(e) => choice.setLanguage(e.target.value)}>
      {languages.map((l) => <option key={l} value={l}>{l === "ar" ? "العربية" : l === "en" ? "English" : l}</option>)}
    </select>
    <select aria-label="Cartesia voice" value={choice.voiceId} onChange={(e) => choice.setVoiceId(e.target.value)} disabled={!choice.voices.length}>
      {!choice.voices.length && <option value="">Cartesia…</option>}
      {choice.voices.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.language}</option>)}
    </select>
  </div>;
}

export function ReplyAudio({ text, ar }: { text: string; ar: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="cx-reply-audio"><Button variant="ghost" size="icon" aria-label={ar ? "سماع الرد" : "Listen to reply"} title={ar ? "سماع الرد" : "Listen to reply"} onClick={() => setOpen((v) => !v)}><Volume2 size={16} /></Button>
    {open && <AudioPanel text={text} ar={ar} />}
  </div>;
}

function AudioPanel({ text, ar }: { text: string; ar: boolean }) {
  const choice = useVoiceChoice(/[\u0600-\u06ff]/.test(text) ? "ar" : "en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const currentUrl = useRef("");
  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { abort.current?.abort(); if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  const generate = async () => {
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError("");
    try {
      const blob = await getSpeech(speechText(text), choice.voiceId, choice.language, controller.signal);
      if (controller.signal.aborted) return;
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      const next = URL.createObjectURL(blob); currentUrl.current = next; setUrl(next);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Audio unavailable"); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return <div className="cx-audio-panel">
    <VoiceChoice choice={choice} />
    <Button variant="ghost" size="icon" disabled={!choice.voiceId} aria-label={loading ? "Cancel audio generation" : "Generate audio"} onClick={() => { if (loading) { abort.current?.abort(); setLoading(false); } else void generate(); }}>{loading ? <Square size={16} /> : <Volume2 size={18} />}</Button>
    {loading && <Loader2 className="animate-spin" size={16} />}
    {url && <><audio ref={audio} controls src={url} aria-label="Generated reply" /><a href={url} download="cartesia-reply.wav" aria-label={ar ? "تنزيل الريكورد" : "Download recording"} title={ar ? "تنزيل الريكورد" : "Download recording"}><Download size={18} /></a></>}
    {(error || choice.error) && <span role="alert">{error || choice.error}</span>}
  </div>;
}