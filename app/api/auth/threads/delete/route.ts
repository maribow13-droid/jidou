export async function GET() {
  return Response.json({ status: "ok" });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  const confirmationCode = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  return Response.json({
    url: `${origin}/api/auth/threads/delete/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
    received: Boolean(signedRequest),
  });
}
