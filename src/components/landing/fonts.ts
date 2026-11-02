import { Figtree, Plus_Jakarta_Sans } from "next/font/google";

// The reference's two faces, both on Google Fonts; next/font self-hosts them (CSP font-src 'self').
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

/** Put on the public page wrapper together with `lp`. */
export const landingFonts = `${jakarta.variable} ${figtree.variable}`;
