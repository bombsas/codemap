import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = "https://rqvfqtyuqfjarluydskr.supabase.co";
const supabaseAnonKey = "sb_publishable_Lzd9kmEBzoiJIQEVBReIow_jELMvyIa";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "implicit",
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});