import { createContext, useContext, useState, type ReactNode } from "react";
import type { BusinessProfile } from "@/lib/business-data";
import { DEMO_PROFILE } from "@/lib/business-data";

export interface Business {
  id: string;
  name: string;
  shortName: string;
  accentColor: string;
  profile: BusinessProfile;
  status: "active" | "onboarding" | "pending";
  currentTier?: "core" | "growth" | "enterprise";
}

export const BUSINESSES: Business[] = [
  {
    id: "bed-bugs-and-beyond",
    name: "Bed Bugs & Beyond",
    shortName: "BB&B",
    accentColor: "#00AEEF",
    profile: DEMO_PROFILE,
    status: "active",
    currentTier: "core",
  },
  {
    id: "simplishelling",
    name: "SimpliShelling",
    shortName: "SS",
    accentColor: "#F26C21",
    profile: {
      businessName: "SimpliShelling",
      websiteUrl: "https://simplishelling.com",
      industry: "E-commerce / Retail",
      city: "Gulf Shores",
      state: "Alabama",
      mainServices: "Premium oyster shell products, coastal home decor, natural building materials",
      targetCustomers: "Homeowners, landscapers, restaurants, and coastal property owners in the Gulf Coast region",
    },
    status: "onboarding",
    currentTier: "growth",
  },
];

const STORAGE_KEY = "aies.activeBusiness";

function loadStoredId(): string {
  if (typeof window === "undefined") return BUSINESSES[0].id;
  return window.localStorage.getItem(STORAGE_KEY) ?? BUSINESSES[0].id;
}

interface BusinessContextValue {
  activeBusiness: Business;
  businesses: Business[];
  setActiveBusinessId: (id: string) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>(loadStoredId);

  const activeBusiness = BUSINESSES.find(b => b.id === activeId) ?? BUSINESSES[0];

  const setActiveBusinessId = (id: string) => {
    if (!BUSINESSES.find(b => b.id === id)) return;
    setActiveId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  return (
    <BusinessContext.Provider value={{ activeBusiness, businesses: BUSINESSES, setActiveBusinessId }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useActiveBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useActiveBusiness must be used within BusinessProvider");
  return ctx;
}
