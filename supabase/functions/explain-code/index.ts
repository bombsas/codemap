import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const BATCH_SIZE = 10;
const MAX_SNIPPET_CHARS = 2000; // truncate giant functions to keep batches fast
const OPENAI_TIMEOUT_MS = 45_000; // give up on a slow OpenAI call before the function wall clock runs out

const EXPLANATION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "code_explanations",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        explanations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              functionId: {
                type: "string",
                description: "The ID of the function being explained",
              },
              purpose: {
                type: "string",
                description:
                  "A one-sentence summary of what this function/class does",
              },
              inputs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["name", "type", "description"],
                },
                description: "Input parameters or arguments",
              },
              outputs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["name", "type", "description"],
                },
                description: "Return values or outputs",
              },
              logic: {
                type: "string",
                description:
                  "Step-by-step explanation of how the code works internally, mentioning key operations",
              },
            },
            required: ["functionId", "purpose", "inputs", "outputs", "logic"],
          },
        },
        remaining: {
          type: "integer",
          description:
            "Number of remaining snippets not yet processed in this batch",
        },
      },
      required: ["explanations", "remaining"],
    },
  },
};

interface Snippet {
  functionId: string;
  code: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { projectId, snippets } = await req.json();

    if (!projectId || !Array.isArray(snippets) || snippets.length === 0) {
      return new Response(
        JSON.stringify({ error: "projectId and snippets[] are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing OPENAI_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Take batch of up to BATCH_SIZE
    const batch = snippets.slice(0, BATCH_SIZE);
    const remaining = Math.max(0, snippets.length - BATCH_SIZE);

    // Build the prompt — truncate oversized snippets to keep the request fast
    const codeBlocks = batch
      .map((s: Snippet) => {
        const code =
          s.code.length > MAX_SNIPPET_CHARS
            ? s.code.slice(0, MAX_SNIPPET_CHARS) + "\n// …(truncated)"
            : s.code;
        return `<function id="${s.functionId}">\n\`\`\`\n${code}\n\`\`\`\n</function>`;
      })
      .join("\n\n");

    const systemPrompt =
      "You are a senior developer explaining code to junior developers. " +
      "For each function or class provided, produce a clear, structured explanation. " +
      "Be precise about inputs, outputs, and the internal logic flow. Use plain English.";

    const userMessage = `Explain the following ${
      batch.length > 1 ? batch.length + " functions" : "function"
    }:\n\n${codeBlocks}`;

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: EXPLANATION_SCHEMA,
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return new Response(
        JSON.stringify({
          error: `OpenAI API error: ${response.status}`,
          details: errBody,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty response from OpenAI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse the JSON response
    const parsed = JSON.parse(content);

    return new Response(
      JSON.stringify({
        explanations: parsed.explanations,
        remaining,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});