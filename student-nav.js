const path = location.pathname.split("/").pop() || "student-dashboard.html";
const dashboard = "student-dashboard.html";
const applicationsPage = "student-applications.html";
const profilePage = "student-profile.html";
const electionPages = ["voter-portal.html", "voting.html", "results.html", "candidate.html", "candidate-directory.html", "student-results.html", "student-receipts.html"];
const tabs = [
  { label: "Home", icon: "⌂", href: dashboard, active: path === dashboard },
  { label: "Elections", icon: "▤", href: "voter-portal.html", active: electionPages.includes(path) },
  { label: "Apply", icon: "▧", href: applicationsPage, active: path === applicationsPage },
  { label: "Profile", icon: "♙", href: profilePage, active: path === profilePage }
];

document.body.classList.add("has-student-bottom-nav");

if (!document.querySelector(".student-bottom-nav")) {
  const nav = document.createElement("nav");
  nav.className = "student-bottom-nav";
  nav.setAttribute("aria-label", "Student navigation");
  tabs.forEach(tab => {
    const a = document.createElement("a");
    a.href = tab.href;
    if (tab.active) a.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.className = "tab-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = tab.icon;
    const label = document.createElement("span");
    label.textContent = tab.label;
    a.append(icon, label);
    nav.append(a);
  });
  document.body.append(nav);
}

const header = document.querySelector(".student-header, .site-header");
if (header && !header.querySelector(".student-desktop-nav")) {
  const nav = document.createElement("nav");
  nav.className = "student-desktop-nav";
  nav.setAttribute("aria-label", "Primary navigation");
  tabs.forEach(tab => {
    const a = document.createElement("a");
    a.href = tab.href;
    a.textContent = tab.label;
    if (tab.active) a.setAttribute("aria-current", "page");
    nav.append(a);
  });
  const actions = header.querySelector(".student-header-actions, .logout-button");
  if (actions) header.insertBefore(nav, actions);
  else header.append(nav);
}

const menuButton = document.getElementById("menu-toggle");
const menu = document.getElementById("student-menu");
if (menuButton && menu) {
  menuButton.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  });
  document.addEventListener("click", event => {
    if (!menu.hidden && !menu.contains(event.target) && !menuButton.contains(event.target)) {
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
}
