export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error_message") ?? url.searchParams.get("error");
  if (error) return Response.redirect(new URL(`/?threads_error=${encodeURIComponent(error)}`, url.origin));
  const code = url.searchParams.get("code");
  if (!code) return Response.json({ error: "Authorization code is missing" }, { status: 400 });
  return Response.redirect(new URL(`/?threads_code_received=1`, url.origin));
}
