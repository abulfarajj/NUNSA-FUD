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
    $("profile-avatar").src = account.profilePicture;
    $("profile-avatar").onerror = () => { $("profile-avatar").src = DEFAULT_PROFILE; };
  }
} catch (error) {
  console.error("Student profile load error:", error);
  $("student-page-message").textContent = "Unable to load your profile. Refresh the page or log in again.";
}

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file || !account) return;
  if (!file.type.startsWith("image/")) { say("Please choose an image file.", true); input.value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { say("Image must be 5 MB or smaller.", true); input.value = ""; return; }

  input.disabled = true;
  say("Uploading your profile picture…");
  try {
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body });
    const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || "Cloudinary upload failed.");
    await updateDoc(doc(db, "students", account.studentDocumentId), { profilePicture: result.secure_url });
    $("profile-avatar").src = result.secure_url;
    const headerAvatar = $("student-profile-picture");
    if (headerAvatar) headerAvatar.src = result.secure_url;
    say("Profile picture updated successfully.");
  } catch (error) {
    console.error("Profile picture upload error:", error);
    say(error.message || "Unable to update your picture. Please try again.", true);
  } finally {
    input.disabled = false;
    input.value = "";
  }
});
