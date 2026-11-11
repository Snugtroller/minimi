const form = document.querySelector("#composer");
const input = document.querySelector("#input");
const chat = document.querySelector("#chat");
const hero = document.querySelector("#hero");
const send = form.querySelector("button");
const history = [];

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant") {
    bubble.innerHTML = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  } else {
    bubble.textContent = text;
  }
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "✦";
    message.append(avatar);
  }
  message.append(bubble);
  chat.append(message);
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function submit(text) {
  const value = text.trim();
  if (!value || send.disabled) return;
  hero.hidden = true;
  input.value = "";
  input.style.height = "auto";
  addMessage("user", value);
  history.push({ role: "user", content: value });
  send.disabled = true;
  const status = document.createElement("div");
  status.className = "typing";
  status.textContent = "Searching and thinking…";
  chat.append(status);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    history.push({ role: "assistant", content: data.answer });
    addMessage("assistant", data.answer);
  } catch (error) {
    addMessage("assistant", `I hit a snag: ${error.message}`);
  } finally {
    status.remove();
    send.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submit(input.value);
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit(input.value);
  }
});
document.querySelectorAll(".chips button").forEach((chip) => {
  chip.addEventListener("click", () => {
    input.value = chip.textContent;
    submit(input.value);
  });
});
