export type CIPeriod = "30days" | "today" | "7days";

export const queryKeys = {
  leads: {
    all: ["leads"] as const,
  },
  socialPosts: {
    all: ["social-posts"] as const,
  },
  callIntelligence: {
    period: (period: CIPeriod) => ["call-intelligence", period] as const,
  },
} as const;
