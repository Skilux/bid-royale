/** Small named chip, for track-fit labels such as Wallet, Escrow or Dispute path. */
export function Chip({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-line text-ink",
    brand: "border-brand text-brand",
    gate: "border-gate text-gate",
  };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-px text-[12px] font-medium ${tones[tone] ?? tones.neutral}`}>
      {children}
    </span>
  );
}
