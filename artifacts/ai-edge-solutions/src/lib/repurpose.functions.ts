import { apiFetch } from "./api";

export async function generateContentPackage(input: {
  businessName: string; service: string; city: string; state?: string; keyword: string;
}): Promise<{ assets: Array<{ channel: string; label: string; body: string }> }> {
  return apiFetch("/ai/repurpose", { method: "POST", body: JSON.stringify(input) });
}
