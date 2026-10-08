import { Barlow_Condensed, Instrument_Serif, JetBrains_Mono } from "next/font/google";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-barlow-cond", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-instrument-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jb-mono", display: "swap" });

/** Self-hosted fonts of the money flow dashboard (next/font, no runtime Google request). Put on the `.flow` root. */
export const flowFontClass = `${display.variable} ${serif.variable} ${mono.variable}`;
