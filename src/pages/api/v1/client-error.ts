export async function POST({ request }: { request: Request }) {
  try {
    const payload = await request.json().catch(() => null);
    const url = new URL(request.url);
    console.error("CLIENT_ERROR", {
      url: url.pathname,
      payload,
    });
  } catch (error: any) {
    console.error("CLIENT_ERROR_PARSE", { message: error?.message ?? String(error) });
  }

  return new Response(null, { status: 204 });
}
