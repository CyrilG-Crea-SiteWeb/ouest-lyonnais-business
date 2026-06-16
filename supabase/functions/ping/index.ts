import { serve } from "https://deno.land/std@0.168.0/http://serve.ts";

serve(async (req) => {
  return new Response(JSON.stringify({ ok: true, message: "pong" }), {
    headers: { "Content-Type": "application/json" },
  });
});
