export function getFlags() {
  return {
    simulatePayments: process.env.SIMULATE_PAYMENTS === "true",
    demoMode: process.env.DEMO_MODE === "canned" ? "canned" : "live",
  };
}

/** True when the Board runs the real Masumi adapter. Mirrors getAdapter in lib/masumi: real only for SIMULATE_PAYMENTS=false. */
export const realPayments = () => process.env.SIMULATE_PAYMENTS === "false";

export const TENDER = {
  budget: 200,
  gate: 5,
  bondRate: 0.25,
  bidFee: 2,
  currency: "tADA",
};
