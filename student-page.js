import { auth, db, waitUser } from "./nunsa-client.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const DEFAULT_PROFILE = "assets/default-profile.jpg";

export async function initStudentPage() {
  const user = await waitUser();
  if (!user) {
    location.href = "index.html";
    return null;
  }

  const studentDocumentId = sessionStorage.getItem("studentDocumentId");
  const storedMatric = sessionStorage.getItem("studentMatricNumber");
  if (!studentDocumentId || !storedMatric) {
    sessionStorage.clear();
    await signOut(auth);
    location.href = "index.html";
    return null;
  }

  const snapshot = await getDoc(doc(db, "students", studentDocumentId));
  if (!snapshot.exists()) {
    sessionStorage.clear();
    await signOut(auth);
    location.href = "index.html";
    return null;
  }

  const student = snapshot.data();
  if (student.status && student.status !== "active") {
    const message = document.getElementById("student-page-message");
    if (message) message.textContent = "Your student account is currently inactive. Contact the electoral committee.";
    return null;
  }

  const name = student.name || sessionStorage.getItem("studentName") || "Student";
  const matric = student.matricNumber || storedMatric;
  const level = student.academicLevel || student.level || student.currentLevel || "Level not set";
  const picture = student.profilePicture || DEFAULT_PROFILE;

  const nameNode = document.getElementById("student-name");
  const matricNode = document.getElementById("profile-matric");
  const levelNode = document.getElementById("student-level");
  const avatar = document.getElementById("student-profile-picture");
  if (nameNode) nameNode.textContent = name;
  if (matricNode) matricNode.textContent = matric;
  if (levelNode) levelNode.textContent = level;
  if (avatar) { avatar.src = picture; avatar.onerror = () => { avatar.src = DEFAULT_PROFILE; }; }

  const logout = document.getElementById("student-logout-btn");
  if (logout && !logout.dataset.bound) {
    logout.dataset.bound = "true";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      logout.textContent = "LOGGING OUT…";
      try {
        sessionStorage.clear();
        await signOut(auth);
        location.href = "index.html";
      } catch (error) {
        console.error("Student logout error:", error);
        logout.disabled = false;
        logout.textContent = "Log out";
      }
    });
  }

  return { user, student, studentDocumentId, matricNumber: matric, name, level, profilePicture: picture };
}
