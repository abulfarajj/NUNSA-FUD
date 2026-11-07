import { auth, db } from "./nunsa-client.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { initStudentPage } from "./student-page.js";

const CLOUDINARY_CLOUD_NAME = "buwozjy8";
const CLOUDINARY_UPLOAD_PRESET = "nunsa_profile_pictures";
const DEFAULT_PROFILE = "assets/default-profile.jpg";
const $ = id => document.getElementById(id);
const message = $("profile-picture-message");
const input = $("profile-picture-input");
let account = null;

function say(text, error = false) {
  message.textContent = text || "";
  message.classList.toggle("error", error);
}

try {
  account = await initStudentPage();
  if (account) {
    $("profile-name").textContent = account.name;
    $("profile-matric-secondary").textContent = account.matricNumber;
    $("profile-level-secondary").textContent = account.level === "Level not set" ? "Not provided" : account.level;
    if (account.offices.length) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = "Position";
      const value = document.createElement("strong");
      value.textContent = `Current ${account.offices.map(o => o.position).join(", ")}`;
      row.append(label, value);
      document.querySelector(".profile-page-data").append(row);
    }
    $("profile-avatar").src = account.profilePicture;
    $("profile-avatar").onerror = () => { $("profile-avatar").src = DEFAULT_PROFILE; };
  }
} catch (error) {
  console.error("Student profile load error:", error);
  $("student-page-message").textContent = "Unable to load your profile. Refresh the page or log in again.";
}

/* ---------- Picture editor: pick, then move and scale inside a circle before saving ---------- */
const editor = $("avatar-editor");
const stage = $("avatar-stage");
const editorImage = $("avatar-image");
const zoom = $("avatar-zoom");
const saveButton = $("avatar-save");
const OUTPUT_SIZE = 512;

let objectUrl = null;
let view = { size: 0, minScale: 1, scale: 1, x: 0, y: 0 };
const pointers = new Map();
let pinchStart = null;

function clamp() {
  const width = editorImage.naturalWidth * view.scale;
  const height = editorImage.naturalHeight * view.scale;
  view.x = Math.min(0, Math.max(view.size - width, view.x));
  view.y = Math.min(0, Math.max(view.size - height, view.y));
}

function paint() {
  clamp();
  editorImage.style.width = `${editorImage.naturalWidth * view.scale}px`;
  editorImage.style.height = `${editorImage.naturalHeight * view.scale}px`;
  editorImage.style.transform = `translate(${view.x}px, ${view.y}px)`;
  zoom.value = String(Math.round((view.scale / view.minScale) * 100));
}

/* Zoom around a point in the stage so the picture does not jump. */
function zoomTo(nextScale, anchorX, anchorY) {
  const scale = Math.min(view.minScale * 4, Math.max(view.minScale, nextScale));
  const ratio = scale / view.scale;
  view.x = anchorX - (anchorX - view.x) * ratio;
  view.y = anchorY - (anchorY - view.y) * ratio;
  view.scale = scale;
  paint();
}

function closeEditor() {
  if (editor.open) editor.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  editorImage.removeAttribute("src");
  input.value = "";
  pointers.clear();
  pinchStart = null;
}

function openEditor(file) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  editorImage.onload = () => {
    view.size = stage.clientWidth;
    view.minScale = Math.max(view.size / editorImage.naturalWidth, view.size / editorImage.naturalHeight);
    view.scale = view.minScale;
    view.x = (view.size - editorImage.naturalWidth * view.scale) / 2;
    view.y = (view.size - editorImage.naturalHeight * view.scale) / 2;
    paint();
  };
  editorImage.src = objectUrl;
  if (!editor.open) editor.showModal();
}

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file || !account) return;
  if (!file.type.startsWith("image/")) { say("Please choose an image file.", true); input.value = ""; return; }
  if (file.size > 10 * 1024 * 1024) { say("Image must be 10 MB or smaller.", true); input.value = ""; return; }
  say("");
  openEditor(file);
});

stage.addEventListener("pointerdown", (event) => {
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
  }
});

stage.addEventListener("pointermove", (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const current = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, current);
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const rect = stage.getBoundingClientRect();
    zoomTo(pinchStart.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.distance), (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
  } else if (pointers.size === 1) {
    view.x += current.x - previous.x;
    view.y += current.y - previous.y;
    paint();
  }
});

const endPointer = (event) => { pointers.delete(event.pointerId); pinchStart = null; };
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);

stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = stage.getBoundingClientRect();
  zoomTo(view.scale * (event.deltaY < 0 ? 1.08 : 1 / 1.08), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

zoom.addEventListener("input", () => {
  zoomTo(view.minScale * (Number(zoom.value) / 100), view.size / 2, view.size / 2);
});

$("avatar-cancel").addEventListener("click", closeEditor);
$("avatar-cancel-x").addEventListener("click", closeEditor);
editor.addEventListener("cancel", (event) => { event.preventDefault(); closeEditor(); });

saveButton.addEventListener("click", async () => {
  if (!account || !editorImage.naturalWidth) return;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const source = view.size / view.scale;
    canvas.getContext("2d").drawImage(editorImage, -view.x / view.scale, -view.y / view.scale, source, source, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the picture."))), "image/jpeg", 0.9));

    const body = new FormData();
    body.append("file", blob, "profile.jpg");
    body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Cloudinary upload failed.");

    await updateDoc(doc(db, "students", account.studentDocumentId), { profilePicture: result.secure_url });
    account.profilePicture = result.secure_url;
    $("profile-avatar").src = result.secure_url;
    const headerAvatar = $("student-profile-picture");
    if (headerAvatar) headerAvatar.src = result.secure_url;
    closeEditor();
    say("Profile picture updated.");
  } catch (error) {
    console.error("Profile picture upload error:", error);
    say(error.message || "Unable to update your picture. Please try again.", true);
    closeEditor();
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save";
  }
});
