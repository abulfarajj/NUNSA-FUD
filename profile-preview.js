const DEFAULT_PROFILE = "assets/default-profile.jpg";

function ensureDialog() {
  let dialog = document.getElementById("profile-preview-dialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "profile-preview-dialog";
  dialog.className = "profile-preview-dialog";
  dialog.setAttribute("aria-labelledby", "profile-preview-name");

  const panel = document.createElement("div");
  panel.className = "profile-preview-panel";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "profile-preview-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close profile preview");
  close.addEventListener("click", () => dialog.close());

  const image = document.createElement("img");
  image.id = "profile-preview-image";
  image.className = "profile-preview-image";
  image.alt = "Student profile picture";
  image.onerror = () => { image.src = DEFAULT_PROFILE; };

  const name = document.createElement("h2");
  name.id = "profile-preview-name";
  name.className = "profile-preview-name";
  const role = document.createElement("p");
  role.id = "profile-preview-role";
  role.className = "profile-preview-role";
  const actions = document.createElement("div");
  actions.className = "profile-preview-actions";
  const info = document.createElement("a");
  info.id = "profile-preview-info";
  info.className = "vote-button profile-preview-info";
  info.textContent = "See profile";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-btn";
  cancel.textContent = "Close";
  cancel.addEventListener("click", () => dialog.close());
  actions.append(info, cancel);
  panel.append(close, image, name, role, actions);
  dialog.append(panel);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

export function showProfilePreview({ name, picture, role, infoHref }) {
  const dialog = ensureDialog();
  const image = document.getElementById("profile-preview-image");
  const title = document.getElementById("profile-preview-name");
  const roleNode = document.getElementById("profile-preview-role");
  const info = document.getElementById("profile-preview-info");
  image.src = picture || DEFAULT_PROFILE;
  title.textContent = name || "Student";
  roleNode.textContent = role || "NUNSA-FUD student";
  if (infoHref) {
    info.href = infoHref;
    info.removeAttribute("aria-disabled");
  } else {
    info.removeAttribute("href");
    info.setAttribute("aria-disabled", "true");
  }
  if (!dialog.open) dialog.showModal();
}

export function bindProfilePreview(root = document) {
  if (!root || root.dataset?.profilePreviewBound === "true") return;
  if (root.dataset) root.dataset.profilePreviewBound = "true";
  root.addEventListener("click", event => {
    const trigger = event.target.closest?.("[data-profile-preview]");
    if (!trigger || !root.contains(trigger)) return;
    event.preventDefault();
    event.stopPropagation();
    showProfilePreview({
      name: trigger.dataset.profileName,
      picture: trigger.dataset.profilePicture,
      role: trigger.dataset.profileRole,
      infoHref: trigger.dataset.profileInfoHref || trigger.getAttribute("href")
    });
  });
}
