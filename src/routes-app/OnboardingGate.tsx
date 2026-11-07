import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Sends signed-in users who haven't finished first-run setup to /onboarding. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"wait" | "ok" | "setup" | "error">("wait");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState("wait");
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) { if (active) setState("ok"); return; }
        const { data: p, error: profileError } = await supabase.from("profiles").select("onboarding_completed").eq("id", data.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (active) setState(p?.onboarding_completed ? "ok" : "setup");
      } catch { if (active) setState("error"); }
    })();
    return () => { active = false; };
  }, [attempt]);
  if (state === "setup") return <Navigate to="/onboarding" replace />;
  if (state === "error") return <main className="grid min-h-dvh place-content-center gap-4 bg-background p-6 text-foreground"><p role="alert">Couldn't load your account. Please try again.</p><Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button></main>;
  return state === "ok" ? <>{children}</> : <div role="status" className="grid min-h-dvh place-content-center bg-background text-muted-foreground">Loading account…</div>;
}
