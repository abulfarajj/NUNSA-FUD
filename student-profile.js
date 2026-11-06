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

const actions = $("profile-upload-actions");
let pendingFile = null;
let previewUrl = null;

function clearPending() {
  pendingFile = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  input.value = "";
  actions.hidden = true;
  if (account) $("profile-avatar").src = account.profilePicture;
}

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (!file || !account) return;
  if (!file.type.startsWith("image/")) { say("Please choose an image file.", true); input.value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { say("Image must be 5 MB or smaller.", true); input.value = ""; return; }

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  pendingFile = file;
  previewUrl = URL.createObjectURL(file);
  $("profile-avatar").src = previewUrl;
  actions.hidden = false;
  say("");
});

$("profile-cancel-btn").addEventListener("click", () => { clearPending(); say(""); });

$("profile-save-btn").addEventListener("click", async () => {
  if (!pendingFile || !account) return;
  const saveBtn = $("profile-save-btn");
  saveBtn.disabled = true;
  say("Uploading your profile picture…");
  try {
    const body = new FormData();
    body.append("file", pendingFile);
    body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Cloudinary upload failed.");
    await updateDoc(doc(db, "students", account.studentDocumentId), { profilePicture: result.secure_url });
    account.profilePicture = result.secure_url;
    const headerAvatar = $("student-profile-picture");
    if (headerAvatar) headerAvatar.src = result.secure_url;
    clearPending();
    say("Profile picture updated.");
  } catch (error) {
    console.error("Profile picture upload error:", error);
    say(error.message || "Unable to update your picture. Please try again.", true);
  } finally {
    saveBtn.disabled = false;
  }
});
