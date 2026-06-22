import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleFormConfigRequest } from "../lib/api-handlers";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return handleFormConfigRequest(res, process.env as Record<string, string>);
}
