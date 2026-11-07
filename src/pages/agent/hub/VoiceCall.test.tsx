import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ speech: vi.fn() }));
vi.mock("./VoiceControls", () => ({ useVoiceChoice: () => ({ voiceId: "voice", language: "ar" }) }));
vi.mock("./HubParts", () => ({ BotAvatar: () => <span /> }));
vi.mock("@/lib/audio/voiceClient", () => ({ getSpeech: mocks.speech, microphoneRecording: vi.fn(), transcribeRecording: vi.fn() }));
import { VoiceCallBar } from "./VoiceCall";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("voice turn identity", () => {
  it("speaks a new turn even when the text is identical to the previous answer", async () => {
    mocks.speech.mockResolvedValue(new Blob(["audio"]));
    URL.createObjectURL = vi.fn(() => "blob:voice"); URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const props = { agent: { id: "agent", name: "Agent", description: "", prompt: "", color: "mono" as const, isDefault: false, createdAt: "" }, lang: "ar" as const, settings: { voice: "Auto", language: "ar", speed: 1 }, agentIds: ["agent"], onSay: vi.fn(), onEnd: vi.fn(), lastReply: "15" };
    const view = render(<VoiceCallBar {...props} busy={true} replyId="old" />);
    view.rerender(<VoiceCallBar {...props} busy={false} replyId="new" />);
    await waitFor(() => expect(mocks.speech).toHaveBeenCalledWith("15", "voice", "ar", expect.any(AbortSignal)));
  });
});