import type { MetadataRoute } from "next";
import { paginasDoSitemap } from "../src/site/rastreadores";

// A regra mora em src/site/rastreadores.ts, pura e testada.
export default function sitemap(): MetadataRoute.Sitemap {
  return paginasDoSitemap(process.env.NEXT_PUBLIC_URL_DO_SITE);
}
