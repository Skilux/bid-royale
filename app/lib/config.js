export function getFlags() {
  return {
    simulatePayments: process.env.SIMULATE_PAYMENTS === "true",
    demoMode: process.env.DEMO_MODE === "canned" ? "canned" : "live",
  };
}

export const TENDER = {
  budget: 200,
  gate: 5,
  bondRate: 0.25,
  bidFee: 2,
  currency: "tADA",
};
