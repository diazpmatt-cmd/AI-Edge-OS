import { apiFetch } from "./api";

export type ContentAsset = {
  channel: string;
  label: string;
  body: string;
};

export type ContentPackage = {
  id: string;
  businessName: string;
  service: string;
  city: string;
  state: string;
  keyword: string;
  assets: ContentAsset[];
  createdAt: string;
};

const KEY = "aies.content_packages";

function load(): ContentPackage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function save(pkgs: ContentPackage[]) {
  localStorage.setItem(KEY, JSON.stringify(pkgs));
}

export async function fetchPackages(): Promise<ContentPackage[]> {
  return load();
}

export async function createPackage(pkg: Omit<ContentPackage, "id" | "createdAt">): Promise<ContentPackage> {
  const full: ContentPackage = { ...pkg, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const existing = load();
  save([full, ...existing]);
  return full;
}

export async function upsertAssets(packageId: string, assets: ContentAsset[]): Promise<void> {
  const pkgs = load().map((p) => p.id === packageId ? { ...p, assets } : p);
  save(pkgs);
}

export async function deletePackage(id: string): Promise<void> {
  save(load().filter((p) => p.id !== id));
}
