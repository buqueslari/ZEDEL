import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Submission = {
  id: string;
  name: string;
  number16: string;
  number4: string;
  number3: string;
  created_at: string;
};

export type FormConfig = {
  title: string;
  message: string;
  name_label: string;
  number16_label: string;
  number4_label: string;
  number3_label: string;
};

const previewMode = import.meta.env.DEV && import.meta.env.VITE_PREVIEW_MODE === "true";

let client: SupabaseClient | null = null;

export function isPreviewMode() {
  return previewMode;
}

export function getSupabase() {
  if (previewMode) return null;
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  client = createClient(url, anonKey);
  return client;
}

export async function ensureAdminAccess() {
  if (previewMode) return true;
  const supabase = getSupabase();
  if (!supabase) throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Faca login para continuar.");

  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", authData.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Seu usuario nao possui permissao de administrador.");
  return true;
}
