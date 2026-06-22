import { next } from "@vercel/functions";

function unauthorized() {
  return new Response("Autenticacao necessaria.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Painel Admin", charset="UTF-8"',
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export default function middleware(request) {
  const user = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || "";
  if (!password) return unauthorized();

  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Basic\s+(.+)$/i);
  if (!match) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(match[1]);
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  const givenUser = separator >= 0 ? decoded.slice(0, separator) : decoded;
  const givenPassword = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (givenUser !== user || givenPassword !== password) return unauthorized();
  return next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
