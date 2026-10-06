import { supabase } from "./supabaseClient";

/** Returns true if the email exists in the `allowed_emails` Supabase table. */
export async function checkEmailAllowed(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("allowed_emails")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
}
