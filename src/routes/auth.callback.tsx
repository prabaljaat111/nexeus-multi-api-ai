import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { ErrorState, LoadingState } from "@/components/states";
import { supabase } from "@/integrations/supabase/client";
import { REDIRECT_STORAGE_KEY, safeRedirect } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Unified AI Workspace" },
      { name: "description", content: "Completing sign-in to Unified AI Workspace." },
      { property: "og:title", content: "Signing you in — Unified AI Workspace" },
      { property: "og:description", content: "Completing sign-in to Unified AI Workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const next = safeRedirect(sessionStorage.getItem(REDIRECT_STORAGE_KEY));
      sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
      navigate({ to: next, replace: true });
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    const timer = window.setTimeout(() => !done && setFailed(true), 10000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <AuthCard title="Signing you in">
      {failed ? (
        <ErrorState title="Sign-in didn't complete" message="The link may have expired." onRetry={() => navigate({ to: "/login" })} />
      ) : (
        <LoadingState label="Finishing sign-in…" />
      )}
    </AuthCard>
  );
}
