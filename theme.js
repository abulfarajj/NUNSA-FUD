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
  document.querySelectorAll(".theme-toggle").forEach(button => {
    const icon = resolved === "dark" ? "☀" : "☾";
    button.textContent = icon;
    button.title = `Current theme: ${selected}. Activate to change appearance.`;
    button.setAttribute("aria-label", `Change appearance. Current theme: ${selected}.`);
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
  const button = event.target.closest?.(".theme-toggle");
  if (!button) return;
  const current = preference();
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  applyTheme(next);
});

// Add a small appearance selector to every shared header, while preserving the
// student dashboard's existing selector inside its hamburger menu.
const header = document.querySelector(".admin-header, .site-header, .student-header");
if (header && !document.getElementById("theme-choice")) {
  const wrap = document.createElement("label");
  wrap.className = "global-theme-picker";
  wrap.htmlFor = "theme-choice";
  wrap.textContent = "Appearance";
  const select = document.createElement("select");
  select.id = "theme-choice";
  select.setAttribute("aria-label", "Choose appearance");
  for (const [value, label] of [["system", "System"], ["light", "Light"], ["dark", "Dark"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
  }
  wrap.append(select);
  header.append(wrap);
}
