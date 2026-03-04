export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    let path = url.searchParams.get("path") || "/";

    // Normalize the path so it always starts with /
    if (!path.startsWith("/")) path = "/" + path;

    // CountAPI expects a valid key; we’ll use the path as the key
    // Example: https://api.countapi.xyz/hit/devynharrington.com/vcf/my-post
    const endpoint = `https://api.countapi.xyz/hit/devynharrington.com${path}`;

    const resp = await fetch(endpoint, {
      headers: { "accept": "application/json" },
    });

    // If CountAPI is down or returns non-200, don't crash
    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          error: "CountAPI request failed",
          status: resp.status,
          endpoint,
        }),
        {
          status: 502,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }
      );
    }

    // CountAPI should return JSON like { value: 123 }
    const data = await resp.json();
    const views = typeof data?.value === "number" ? data.value : 0;

    return new Response(JSON.stringify({ views, path }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // NEVER throw — always return JSON so you can see the real error
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