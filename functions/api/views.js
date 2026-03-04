export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    let path = url.searchParams.get("path") || "/";

    if (!path.startsWith("/")) path = "/" + path;
    if (path.length > 1) path = path.replace(/\/+$/, "");

    const key = `views:${path}`;

    const currentRaw = await context.env.PAGE_VIEWS.get(key);
    const current = currentRaw ? parseInt(currentRaw, 10) : 0;

    const next = current + 1;
    await context.env.PAGE_VIEWS.put(key, String(next));

    return new Response(JSON.stringify({ path, views: next }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Function exception",
        message: err?.message || String(err),
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  }
}