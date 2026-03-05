import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
if (!supabaseAnonKey) throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY (o PUBLISHABLE_KEY) en .env.local");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);