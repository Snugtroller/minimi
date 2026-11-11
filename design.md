# Searchlight design

## Product goal

Searchlight is a fast, source-aware chat agent for questions where freshness or niche knowledge matters. Its only capability beyond conversation is one deliberately narrow `web_search` tool.

## Architecture

```text
Browser UI
   |
   | POST /api/chat
   v
Node HTTP server
   |
   +-- Groq OpenAI-compatible chat completion
   |       |
   |       +-- web_search tool call
   |
   +-- DuckDuckGo HTML search
```

The browser owns the visible conversation state. The server receives the last twelve turns, adds the system policy, and runs a bounded tool loop. Search is server-side so provider details and future API keys never reach the browser.

## Why one tool

One high-quality search tool keeps the agent predictable and quick. The model decides whether a question needs current evidence. Search results include title, URL, and snippet, which is enough for grounding while avoiding unnecessary page scraping and extra tool latency.

## Answer policy

- Search current, niche, uncertain, or source-sensitive questions.
- Prefer direct sources when the results provide them.
- Include compact markdown source links after searched answers.
- Never fabricate a source or hide uncertainty.
- Use a maximum of three model/tool turns.
- Limit search output to six results and request history to twelve turns.

## Runtime

1. Install Node.js 18 or newer.
2. Set `GROQ_API_KEY` for model-backed answers.
3. Optionally set `GROQ_MODEL`; it defaults to `llama-3.3-70b-versatile`.
4. Run `npm start` and open `http://localhost:3000`.

If no API key is present, the app uses the same web search provider and returns a transparent, source-linked result list. This makes the demo usable without silently pretending to be an LLM.

## Trade-offs and next steps

DuckDuckGo HTML is intentionally keyless for a small project, but a production deployment should use a supported search API with explicit rate limits and monitoring. The next improvements would be streaming responses, persistent conversations, provider retry/backoff, and source quality scoring.
