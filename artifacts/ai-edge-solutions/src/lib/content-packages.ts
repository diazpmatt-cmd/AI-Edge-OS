import { apiFetch } from "./api";

export type ContentAsset = {
  id?: string;
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

export async function fetchPackages(): Promise<ContentPackage[]> {
  return apiFetch<ContentPackage[]>("/content-packages");
}

export async function createPackage(
  pkg: Omit<ContentPackage, "id" | "createdAt">,
): Promise<ContentPackage> {
  return apiFetch<ContentPackage>("/content-packages", {
    method: "POST",
    body: JSON.stringify(pkg),
  });
}

export async function deletePackage(id: string): Promise<void> {
  return apiFetch<void>(`/content-packages/${id}`, { method: "DELETE" });
}
