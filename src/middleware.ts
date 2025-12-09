import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const wwwRedirect = process.env.NEXT_PUBLIC_WWW_REDIRECT === "true";

  // --- REMOVED DOMAIN ENFORCEMENT ---
  // Previously, this code checked if the host matched NEXT_PUBLIC_SITE_URL
  // and redirected if it didn't. By removing it, we allow ANY domain.

  // Optional: WWW Redirect (e.g. example.com -> www.example.com)
  // You can disable this by setting NEXT_PUBLIC_WWW_REDIRECT=false in your .env
  if (wwwRedirect && host && !host.startsWith("www.")) {
    const newUrl = new URL(request.url);
    newUrl.host = `www.${host}`;
    return NextResponse.redirect(newUrl.toString(), 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/|_static/|examples/|_vercel|[\\w-]+\\.\\w+).*)"
  ],
};