import { supabase } from "@/integrations/supabase/client";
import type { AssetStatus, ChannelId } from "./content-channels";

export type ContentPackage = {
  id: string;
  project: string;
  businessName: string;
  service: string;
  city: string;
  state: string;
  keyword: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentAsset = {
  id: string;
  packageId: string;
  channel: ChannelId;
  title: string;
  body: string;
  status: AssetStatus;
  publishedUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

function pkgFromRow(r: any): ContentPackage {
  return {
    id: r.id,
    project: r.project,
    businessName: r.business_name,
    service: r.service,
    city: r.city,
    state: r.state,
    keyword: r.keyword,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function assetFromRow(r: any): ContentAsset {
  return {
    id: r.id,
    packageId: r.package_id,
    channel: r.channel,
    title: r.title,
    body: r.body,
    status: r.status,
    publishedUrl: r.published_url,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchPackages(): Promise<ContentPackage[]> {
  const { data, error } = await supabase
    .from("content_packages")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(pkgFromRow);
}

export async function fetchPackage(id: string): Promise<ContentPackage | null> {
  const { data, error } = await supabase
    .from("content_packages")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? pkgFromRow(data) : null;
}

export async function fetchAssets(packageId: string): Promise<ContentAsset[]> {
  const { data, error } = await supabase
    .from("content_assets")
    .select("*")
    .eq("package_id", packageId);
  if (error) throw error;
  return (data ?? []).map(assetFromRow);
}

export async function fetchAllAssets(): Promise<ContentAsset[]> {
  const { data, error } = await supabase
    .from("content_assets")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(assetFromRow);
}

export async function createPackage(input: {
  businessName: string;
  service: string;
  city: string;
  state: string;
  keyword: string;
  title: string;
}): Promise<ContentPackage> {
  const { data, error } = await supabase
    .from("content_packages")
    .insert({
      business_name: input.businessName,
      service: input.service,
      city: input.city,
      state: input.state,
      keyword: input.keyword,
      title: input.title,
    })
    .select("*")
    .single();
  if (error) throw error;
  return pkgFromRow(data);
}

export async function upsertAssets(
  packageId: string,
  assets: { channel: ChannelId; title: string; body: string }[],
): Promise<void> {
  const rows = assets.map((a) => ({
    package_id: packageId,
    channel: a.channel,
    title: a.title,
    body: a.body,
    status: "draft" as AssetStatus,
  }));
  const { error } = await supabase
    .from("content_assets")
    .upsert(rows, { onConflict: "package_id,channel" });
  if (error) throw error;
}

export async function updateAsset(
  id: string,
  patch: Partial<Pick<ContentAsset, "title" | "body" | "status" | "publishedUrl">>,
): Promise<void> {
  const row: any = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.status !== undefined) {
    row.status = patch.status;
    if (patch.status === "published") row.published_at = new Date().toISOString();
  }
  if (patch.publishedUrl !== undefined) row.published_url = patch.publishedUrl;
  const { error } = await supabase.from("content_assets").update(row).eq("id", id);
  if (error) throw error;
}

export async function deletePackage(id: string): Promise<void> {
  const { error } = await supabase.from("content_packages").delete().eq("id", id);
  if (error) throw error;
}
