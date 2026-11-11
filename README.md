# Searchlight

Searchlight is a small chat agent with one tool: web search. It is designed to answer quickly, ground current claims in links, and stay honest when sources are weak.

## Run

```powershell
npm start
```

Open [http://localhost:3000](http://localhost:3000).

For Groq-backed chat, set your Groq API key before starting:

```powershell
$env:GROQ_API_KEY = "your-key"
npm start
```

Without a key, Searchlight still performs a live web search and displays source-linked results.

The default Groq model is `llama-3.3-70b-versatile`. To choose another supported model:

```powershell
$env:GROQ_MODEL = "llama-3.3-70b-versatile"
```

Read [design.md](./design.md) for the architecture and product decisions.
