import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const model =
  process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "llama-3.3-70b-versatile";
const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API;

const systemPrompt = `You are Searchlight, a fast and careful chat agent.
Answer directly and clearly. Use the web_search tool when the question asks about current, niche, uncertain, or factual information that benefits from sources. You may answer casual conversation without searching.
When you search, ground claims in the returned results, prefer primary sources, and include a compact Sources section with markdown links. Never invent citations or claim you visited a page that was not returned.
If search results are weak or conflicting, say so and explain what is uncertain. Use the user's language.`;

const tool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the public web for current information and source URLs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A focused search query with the important names, dates, or terms.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(value) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return "";
  }
}

async function webSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const result = await fetch(url, {
    headers: {
      "user-agent": "Searchlight/1.0 (+https://github.com)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) {
    throw new Error(`Search provider returned ${result.status}`);
  }
  const html = await result.text();
  const items = [];
  const pattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;
  for (const match of html.matchAll(pattern)) {
    const title = decodeHtml(match[2]);
    const link = cleanUrl(match[1]);
    const snippet = decodeHtml(match[3] || match[4] || "");
    if (title && link && snippet) {
      items.push({ title, link, snippet });
    }
    if (items.length === 6) break;
  }
  return { query, results: items };
}

function fallbackAnswer(query, data) {
  if (!data.results.length) {
    return `I couldn't find useful public results for **${query}**. Try a more specific query.`;
  }
  const lines = data.results.map(
    (item, index) =>
      `${index + 1}. **[${item.title}](${item.link})** — ${item.snippet}`,
  );
  return `Here are the most relevant results I found for **${query}**:\n\n${lines.join("\n")}\n\nThese are search-result summaries; open the sources for full context.`;
}

async function callModel(messages) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages,
        tools: [tool],
        tool_choice: "auto",
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Model request failed (${response.status}): ${detail.slice(0, 180)}`,
    );
  }
  const body = await response.json();
  return body.choices?.[0]?.message;
}

async function answer(messages) {
  if (!apiKey) {
    const latest =
      messages.filter((item) => item.role === "user").at(-1)?.content || "";
    return fallbackAnswer(latest, await webSearch(latest));
  }
  const working = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-12),
  ];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const message = await callModel(working);
    if (!message) throw new Error("The model returned an empty response.");
    if (!message.tool_calls?.length)
      return message.content || "I couldn't produce an answer.";
    working.push(message);
    for (const call of message.tool_calls) {
      if (call.function.name !== "web_search") continue;
      let args;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        throw new Error("The model produced invalid search arguments.");
      }
      const results = await webSearch(String(args.query || ""));
      working.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(results),
      });
    }
  }
  throw new Error("The agent exceeded its tool-use limit.");
}

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 100000) throw new Error("Request is too large.");
  }
  return JSON.parse(value || "{}");
}

async function serve(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host}`)
    .pathname;
  if (request.method === "POST" && pathname === "/api/chat") {
    try {
      const payload = await body(request);
      if (
        !Array.isArray(payload.messages) ||
        payload.messages.some(
          (item) => !["user", "assistant"].includes(item.role),
        )
      ) {
        return sendJson(response, 400, {
          error: "Messages must be user and assistant turns.",
        });
      }
      const cleanMessages = payload.messages
        .filter((item) => typeof item.content === "string")
        .map((item) => ({
          role: item.role,
          content: item.content.slice(0, 12000),
        }));
      if (!cleanMessages.length)
        return sendJson(response, 400, { error: "Ask a question to begin." });
      return sendJson(response, 200, {
        answer: await answer(cleanMessages),
        model: apiKey ? model : "search-fallback",
      });
    } catch (error) {
      return sendJson(response, 500, {
        error:
          error instanceof Error ? error.message : "Unexpected server error.",
      });
    }
  }
  if (request.method === "GET") {
    const requested = pathname === "/" ? "/public/index.html" : pathname;
    const file = join(root, requested.replace(/^\/+/, ""));
    try {
      const content = await readFile(file);
      const type =
        extname(file) === ".html"
          ? "text/html"
          : extname(file) === ".js"
            ? "text/javascript"
            : "text/css";
      response.writeHead(200, { "content-type": `${type}; charset=utf-8` });
      return response.end(content);
    } catch {
      response.writeHead(404);
      return response.end("Not found");
    }
  }
  response.writeHead(405);
  response.end("Method not allowed");
}

http.createServer(serve).listen(port, () => {
  console.log(`Searchlight is running at http://localhost:${port}`);
});
