import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleSubmitRequest } from "../lib/api-handlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleSubmitRequest(req, res, process.env as Record<string, string>);
}
