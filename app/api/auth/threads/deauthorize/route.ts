export async function GET() {
  return Response.json({ status: "ok" });
}

export async function POST() {
  // Meta calls this endpoint when a user removes the app authorization.
  // Connection cleanup will be added when OAuth token storage is enabled.
  return Response.json({ success: true });
}
