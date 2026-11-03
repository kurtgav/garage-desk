import { Instrument_Sans, Space_Mono } from "next/font/google";

// The reference's two faces, both on Google Fonts; next/font self-hosts them (CSP font-src 'self').
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: "400", variable: "--font-space-mono", display: "swap" });

/** Put on the public page wrapper together with `lp`. */
export const landingFonts = `${instrument.variable} ${spaceMono.variable}`;
