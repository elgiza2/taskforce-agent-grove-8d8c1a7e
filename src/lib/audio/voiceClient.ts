import { supabase } from "@/integrations/supabase/client";
import type { Voice } from "./voiceSchema";

async function voiceFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Please sign in");
  const response = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Voice service unavailable");
  }
  return response;
}

let catalogue: Promise<Voice[]> | undefined;
export function getVoices() {
  if (!catalogue) catalogue = voiceFetch("/api/voice").then((r) => r.json()).then((d) => d.voices as Voice[]).catch((error) => { catalogue = undefined; throw error; });
  return catalogue;
}

export async function getSpeech(text: string, voiceId: string, language: string, signal?: AbortSignal) {
  return (await voiceFetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId, language }), signal })).blob();
}

export async function transcribeRecording(file: Blob, language: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file, file.type.includes("mp4") ? "recording.mp4" : file.type.includes("wav") ? "recording.wav" : "recording.webm"); form.append("language", language);
  const body = await (await voiceFetch("/api/voice-transcribe", { method: "POST", body: form, signal })).json();
  if (!body.text?.trim()) throw new Error("No speech detected. Try recording again.");
  return String(body.text);
}

export async function microphoneRecording(options: { autoStop?: boolean } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone recording is unavailable in this browser.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    let detector: { stop: () => void } | undefined;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => { clearTimeout(timer); clearTimeout(silenceTimer); detector?.stop(); stream.getTracks().forEach((t) => t.stop()); };
    let timer: ReturnType<typeof setTimeout>;
    const result = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      recorder.onerror = () => { release(); reject(new Error("Recording failed")); };
      recorder.onstop = () => { release(); resolve(new Blob(parts, { type: recorder.mimeType })); };
    });
    recorder.start();
    const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
    if (options.autoStop) {
      try {
        const { default: hark } = await import("hark");
        const speech = hark(stream, { threshold: -50, interval: 100, play: false });
        detector = speech;
        speech.on("speaking", () => clearTimeout(silenceTimer));
        speech.on("stopped_speaking", () => { clearTimeout(silenceTimer); silenceTimer = setTimeout(stop, 1200); });
      } catch (error) { stop(); throw error; }
    }
    timer = setTimeout(stop, 60_000);
    return { stop, result };
  } catch (error) { stream.getTracks().forEach((t) => t.stop()); throw error; }
}