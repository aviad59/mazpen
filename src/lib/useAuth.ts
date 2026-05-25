import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

interface AuthState {
  user: User | null | undefined; // undefined = loading
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = React.useState<User | null | undefined>(undefined);

  React.useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION (current state),
    // and again with SIGNED_IN once it processes hash tokens from OAuth redirect.
    // Using this alone avoids the race condition where getSession() returns null
    // before Supabase has a chance to exchange the hash tokens.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { user, signInWithGoogle, signOut };
}
