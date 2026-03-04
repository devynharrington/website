export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path") || "/";

  const endpoint = "https://api.countapi.xyz/hit/devynharrington.com" + path;

  const resp = await fetch(endpoint);
  const data = await resp.json();

  return new Response(JSON.stringify({ views: data.value }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}