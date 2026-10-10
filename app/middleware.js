import { NextResponse } from "next/server";

/**
 * Read-only demo guard.
 *
 * When READ_ONLY=true, every API write is rejected with 403 and visitors can
 * only replay the bundled recordings (judge page, guided demo, dashboard,
 * receipt). Live deployments are unaffected.
 *
 * NOTE: Next.js inlines process.env.* in middleware at build time, so READ_ONLY
 * must be set in the Vercel project settings before the first build/deploy.
 */
const READ_ONLY = process.env.READ_ONLY === "true";

export function middleware(request) {
  if (!READ_ONLY) return NextResponse.next();
  // The matcher below already scopes this middleware to /api/*.
  // GET /api/settlement/tick also advances settlement, so it is blocked too.
  if (request.method === "GET" && request.nextUrl.pathname !== "/api/settlement/tick") {
    return NextResponse.next();
  }
  return NextResponse.json(
    { error: "read_only", message: "Demo deployment: replay only, new runs are disabled." },
    { status: 403 }
  );
}

export const config = { matcher: "/api/:path*" };
