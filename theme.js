const STORAGE_KEY = "nunsa-theme";
const root = document.documentElement;
const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const choices = ["system", "light", "dark"];

function preference() {
  try { return localStorage.getItem(STORAGE_KEY) || "system"; } catch { return "system"; }
}
function applyTheme(value) {
  const selected = choices.includes(value) ? value : "system";
  const resolved = selected === "system" ? (media && media.matches ? "dark" : "light") : selected;
  root.dataset.theme = resolved;
  root.dataset.themePreference = selected;
  document.querySelectorAll("#theme-choice").forEach(select => { select.value = selected; });
  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === selected));
  });
  const names = { system: "Auto", light: "Light", dark: "Dark" };
  const icons = { system: "◐", light: "☀", dark: "☾" };
  document.querySelectorAll(".theme-toggle").forEach(button => {
    button.textContent = icons[selected];
    button.title = `Appearance: ${names[selected]} (tap to change)`;
    button.setAttribute("aria-label", `Appearance: ${names[selected]}. Tap to change.`);
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "dark" ? "#101a1d" : "#f5f4ef";
}

applyTheme(preference());
media?.addEventListener?.("change", () => {
  if ((root.dataset.themePreference || "system") === "system") applyTheme("system");
});

document.addEventListener("change", event => {
  if (event.target?.id !== "theme-choice") return;
  const next = event.target.value;
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  applyTheme(next);
});

document.addEventListener("click", event => {
  const choice = event.target.closest?.("[data-theme-choice]");
  if (choice) {
    const next = choice.dataset.themeChoice;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyTheme(next);
    return;
  }
  const button = event.target.closest?.(".theme-toggle");
  if (!button) return;
  const current = preference();
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  applyTheme(next);
});

// Compact appearance button for every shared header (one small icon, not a wide dropdown).
// The student home / profile / applications pages have their own control inside the menu.
const header = document.querySelector(".admin-header, .site-header, .student-header");
if (header && !document.getElementById("theme-choice") && !document.querySelector("[data-theme-choice]") && !header.querySelector(".theme-toggle")) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "theme-toggle";
  const lastAction = [...header.children].reverse().find(node => node.matches("button, a"));
  const tools = document.createElement("div");
  tools.className = "header-tools";
  if (lastAction) { lastAction.before(tools); tools.append(toggle, lastAction); } else { tools.append(toggle); header.append(tools); }
  applyTheme(preference());
}
