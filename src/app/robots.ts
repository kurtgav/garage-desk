import type { MetadataRoute } from "next";

/** Only the landing page is public marketing (D-094); staff pages and customer links stay out of search. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/$", disallow: "/" } };
}
