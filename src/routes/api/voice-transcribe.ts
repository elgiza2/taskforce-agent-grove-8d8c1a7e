import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice-transcribe")({ server: { handlers: {
  POST: async ({ request }) => {
    const { authenticate } = await import("@/lib/ceyo/auth.server");
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return Response.json({ error: "Please sign in" }, { status: 401 });
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob) || !file.size || file.size > 20 * 1024 * 1024 || !/^(audio|video)\//.test(file.type))
        return Response.json({ error: "Upload an audio recording smaller than 20 MB." }, { status: 400 });
      const { transcribeAudio } = await import("@/lib/audio/transcribeCore");
      const { status, body } = await transcribeAudio(file, { language: String(form.get("language") || "en"), filename: file.type.includes("mp4") ? "recording.mp4" : file.type.includes("wav") ? "recording.wav" : "recording.webm" });
      return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "Could not transcribe the recording." }, { status: 502 }); }
  },
} } });