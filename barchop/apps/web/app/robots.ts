import type { MetadataRoute } from "next";
import { regrasDoRobots } from "../src/site/rastreadores";

// A regra mora em src/site/rastreadores.ts, pura e testada.
export default function robots(): MetadataRoute.Robots {
  return regrasDoRobots(process.env.NEXT_PUBLIC_URL_DO_SITE);
}
