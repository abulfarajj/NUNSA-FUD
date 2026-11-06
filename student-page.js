import { auth, db, waitUser, noticesApi } from "./nunsa-client.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const DEFAULT_PROFILE = "assets/default-profile.jpg";

export async function initStudentPage() {
  const user = await waitUser();
  if (!user) {
    location.href = "index.html";
    return null;
  }

  // sessionStorage is tab-scoped. A student opening a dashboard link in a new
  // tab still has a valid Firebase session, so recover the student identity
  // from the signed custom-token claim instead of logging them out.
  const tokenResult = await user.getIdTokenResult();
  const claimMatric = String(tokenResult.claims.matricNumber || "").trim().toUpperCase();
  if (!claimMatric) {
    location.href = "index.html";
    return null;
  }

  const matricDocumentId = claimMatric.replace(/[^A-Z0-9]/g, "_");
  const storedMatric = sessionStorage.getItem("studentMatricNumber");
  // Never trust stale tab storage over the identity signed into the token.
  const studentDocumentId = matricDocumentId;
  if (storedMatric && storedMatric.trim().toUpperCase() !== claimMatric) {
    sessionStorage.clear();
  }
  sessionStorage.setItem("studentDocumentId", studentDocumentId);
  sessionStorage.setItem("studentMatricNumber", claimMatric);

  const snapshot = await getDoc(doc(db, "students", studentDocumentId));
  if (!snapshot.exists()) {
    const message = document.getElementById("student-page-message");
    if (message) message.textContent = "Your student record could not be found. Contact the electoral committee.";
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

  const officesPromise = noticesApi(null, "?me=1").then(me => (me && me.offices) || []).catch(() => []);

  const nameNode = document.getElementById("student-name");
  const matricNode = document.getElementById("profile-matric");
  const levelNode = document.getElementById("student-level");
  const avatar = document.getElementById("student-profile-picture");
  if (nameNode) nameNode.textContent = name;
  if (matricNode) matricNode.textContent = matric;
  if (levelNode) levelNode.textContent = level;
  if (avatar) { avatar.src = picture; avatar.onerror = () => { avatar.src = DEFAULT_PROFILE; }; }

  const offices = await officesPromise;
  const officeText = offices.map(o => o.position).join(", ");
  const metaNode = levelNode ? levelNode.parentElement : null;
  if (officeText && metaNode && !document.getElementById("student-office")) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = "·";
    const office = document.createElement("span");
    office.id = "student-office";
    office.textContent = `Current ${officeText}`;
    metaNode.append(dot, office);
  }

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

  return { user, student, studentDocumentId, matricNumber: matric, name, level, profilePicture: picture, offices };
}
