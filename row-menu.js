/* Three-dots menu for any row that has actions. One click listener on the page handles every menu, including ones made from HTML strings. */

const DOTS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg>';

function closeAll() {
    document.querySelectorAll(".kebab-menu").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll(".kebab-btn").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function openMenu(button, menu) {
    menu.hidden = false;
    menu.classList.remove("up");
    menu.style.left = "";
    menu.style.right = "";
    if (menu.getBoundingClientRect().bottom > window.innerHeight - 8) menu.classList.add("up");
    if (menu.getBoundingClientRect().left < 8) { menu.style.right = "auto"; menu.style.left = "0"; }
    button.setAttribute("aria-expanded", "true");
}

if (!window.__kebabWired) {
    window.__kebabWired = true;
    document.addEventListener("click", (event) => {
        const toggle = event.target.closest(".kebab-btn");
        if (toggle) {
            const menu = toggle.parentElement.querySelector(".kebab-menu");
            const wasOpen = menu && !menu.hidden;
            closeAll();
            if (menu && !wasOpen) openMenu(toggle, menu);
            return;
        }
        if (event.target.closest(".kebab-menu")) setTimeout(closeAll, 0);
        else closeAll();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAll(); });
}

/* items: [{ label, onClick(button), danger }]. Falsy entries are skipped, so conditions can be written inline. */
export function kebab(label, items) {
    const wrap = document.createElement("div");
    wrap.className = "kebab";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "kebab-btn";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = DOTS;

    const menu = document.createElement("div");
    menu.className = "kebab-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    items.filter(Boolean).forEach((entry) => {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        if (entry.danger) item.className = "danger";
        item.textContent = entry.label;
        item.addEventListener("click", () => entry.onClick(item));
        menu.append(item);
    });

    wrap.append(button, menu);
    return wrap;
}

/* The same menu as an HTML string, for pages that build rows from templates. itemsHtml is a string of <button> elements. */
export function kebabMarkup(label, itemsHtml) {
    return `<div class="kebab"><button type="button" class="kebab-btn" aria-label="${label}" aria-haspopup="menu" aria-expanded="false">${DOTS}</button><div class="kebab-menu" role="menu" hidden>${itemsHtml}</div></div>`;
}
