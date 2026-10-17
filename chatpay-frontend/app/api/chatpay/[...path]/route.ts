import { NextRequest, NextResponse } from "next/server";
import { backendFetch, SESSION_COOKIE } from "../../../../lib/server-api";
const safeHeaders = { "Cache-Control": "no-store" };
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const method = request.method;
  if (
    method !== "GET" &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json(
      { message: "Request origin was not accepted." },
      { status: 403, headers: safeHeaders },
    );

  if (path === "logout" && method === "POST") {
    const response = NextResponse.json(
      { success: true },
      { headers: safeHeaders },
    );
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  const publicRoute =
    ["auth/challenge", "auth/verify"].includes(path) && method === "POST";
  const allowed =
    publicRoute ||
    (method === "GET" &&
      /^(me\/wallet|recipients|payments(?:\/[a-zA-Z0-9-]+)?)$/.test(path)) ||
    (method === "POST" &&
      /^(commands|recipients|payments\/[a-zA-Z0-9-]+\/submit)$/.test(path)) ||
    (["PATCH", "DELETE"].includes(method) &&
      /^recipients\/[a-zA-Z0-9-]+$/.test(path));
  if (!allowed)
    return NextResponse.json(
      { message: "Endpoint not found." },
      { status: 404, headers: safeHeaders },
    );
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!publicRoute && !token)
    return NextResponse.json(
      { message: "Please sign in with your wallet." },
      { status: 401, headers: safeHeaders },
    );
  try {
    const body = method === "GET" ? undefined : await request.text();
    if (body && body.length > 100000)
      return NextResponse.json(
        { message: "Request is too large." },
        { status: 413, headers: safeHeaders },
      );
    const upstream = await backendFetch(`${path}${request.nextUrl.search}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(!publicRoute ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    if (upstream.status === 204)
      return new NextResponse(null, { status: 204, headers: safeHeaders });
    const data = await upstream
      .json()
      .catch(() => ({
        message: "The Testnet backend returned an invalid response.",
      }));
    if (path === "auth/verify" && upstream.ok) {
      if (!data.token || !data.user?.publicKey)
        return NextResponse.json(
          { message: "Sign-in could not be verified." },
          { status: 502, headers: safeHeaders },
        );
      const response = NextResponse.json(
        { user: data.user },
        { headers: safeHeaders },
      );
      response.cookies.set(SESSION_COOKIE, data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 3600,
      });
      return response;
    }
    const response = NextResponse.json(data, {
      status: upstream.status,
      headers: safeHeaders,
    });
    if (upstream.status === 401) response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch {
    return NextResponse.json(
      {
        code: "BACKEND_UNAVAILABLE",
        message:
          "The Testnet backend is unavailable. Please try again shortly.",
      },
      { status: 503, headers: safeHeaders },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
