Deno.serve(async (_req) => {
  return new Response(JSON.stringify({ ok: true, message: "pong" }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
