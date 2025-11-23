
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const wwwRedirect = process.env.NEXT_PUBLIC_WWW_REDIRECT === "true";

  if (
    host &&
    process.env.NEXT_PUBLIC_SITE_URL &&
    !host.endsWith(process.env.NEXT_PUBLIC_SITE_URL.replace(/https?:\/\//, ''))
  ) {
    const newUrl = new URL(request.url);
    newUrl.host = process.env.NEXT_PUBLIC_SITE_URL.replace(/https?:\/\//, '');
    return NextResponse.redirect(newUrl.toString(), 301);
  }

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
