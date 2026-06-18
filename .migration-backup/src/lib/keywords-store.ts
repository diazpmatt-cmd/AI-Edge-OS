import { supabase } from "@/integrations/supabase/client";
import type { Keyword } from "./business-data";

type Row = {
  id: string;
  keyword: string;
  volume: number;
  difficulty: string;
  intent: string;
  service: string;
  city: string;
  state: string;
};

function rowToKeyword(r: Row): Keyword {
  return {
    id: r.id,
    keyword: r.keyword,
    volume: r.volume,
    difficulty: (r.difficulty as Keyword["difficulty"]) ?? "Medium",
    intent: (r.intent as Keyword["intent"]) ?? "Local",
    service: r.service,
    city: r.city,
    state: r.state,
  };
}

export async function fetchKeywords(): Promise<Keyword[]> {
  const { data, error } = await supabase
    .from("keywords")
    .select("*")
    .order("volume", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToKeyword(r as Row));
}

export async function insertKeywords(
  items: Array<Omit<Keyword, "id">>,
): Promise<Keyword[]> {
  if (!items.length) return [];
  const { data, error } = await supabase
    .from("keywords")
    .insert(items)
    .select("*");
  if (error) throw error;
  return (data ?? []).map((r) => rowToKeyword(r as Row));
}

export async function clearKeywords(): Promise<void> {
  const { error } = await supabase
    .from("keywords")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}
