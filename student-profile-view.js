import { auth, waitUser, el } from "./nunsa-client.js";

const root = document.getElementById("student-public-profile");
const params = new URLSearchParams(location.search);
const studentId = params.get("id") || "";
const electionId = params.get("electionId") || "";
const candidateId = params.get("candidateId") || "";
const DEFAULT_PROFILE = "assets/default-profile.jpg";

async function request(path) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
  if (!response.ok || !data.success) throw new Error(data.message || "Unable to load this profile.");
  return data;
}

(async () => {
  try {
    const user = await waitUser();
    if (!user) {
      localStorage.setItem("nunsaNext", location.pathname + location.search);
      location.href = "index.html";
      return;
    }
    if (!studentId || studentId.includes("/")) throw new Error("This profile link is incomplete.");

    const data = await request(`/.netlify/functions/get-student-profile?id=${encodeURIComponent(studentId)}`);
    const profile = data.profile;
    document.title = `${profile.name} · NUNSA-FUD`;
    root.replaceChildren();

    const card = el("section", "profile-page-card public-student-profile-card");
    const photoWrap = el("div", "profile-page-photo");
    const photo = el("img", "profile-large-avatar");
    photo.src = profile.profilePicture || DEFAULT_PROFILE;
    photo.alt = `${profile.name} profile picture`;
    photo.onerror = () => { photo.src = DEFAULT_PROFILE; };
    photoWrap.append(photo);

    const dataWrap = el("div", "profile-page-data");
    dataWrap.append(el("h1", "", profile.name));
    if (profile.academicLevel) {
      const level = el("div", "");
      level.append(el("span", "", "Academic level"), el("strong", "", profile.academicLevel));
      dataWrap.append(level);
    }
    if (profile.offices?.length) {
      const office = el("div", "");
      office.append(el("span", "", "Current office"), el("strong", "", profile.offices.map(item => item.position).join(", ")));
      dataWrap.append(office);
    }
    card.append(photoWrap, dataWrap);
    root.append(card);

    const biography = el("section", "dashboard-section profile-public-bio");
    biography.append(el("h2", "", "Biography"));
    biography.append(el("p", "", profile.biography || "This student has not added a biography yet."));
    root.append(biography);

    if (electionId && candidateId) {
      try {
        const candidateData = await request(`/.netlify/functions/get-election-overview?electionId=${encodeURIComponent(electionId)}&candidateId=${encodeURIComponent(candidateId)}`);
        const candidate = candidateData.candidates?.[0];
        if (candidate) {
          const mandate = el("section", "dashboard-section profile-public-bio");
          mandate.append(el("h2", "", `Mandate · ${candidate.position}`));
          mandate.append(el("p", "", candidate.mandate || candidate.manifesto || "This candidate has not published a mandate yet."));
          root.append(mandate);
        }
      } catch (error) {
        console.warn("Candidate mandate unavailable:", error.message);
      }
    }

    const back = document.getElementById("profile-back");
    if (back && electionId) back.href = `candidate-directory.html?electionId=${encodeURIComponent(electionId)}`;
  } catch (error) {
    root.replaceChildren(el("p", "message error", error.message || "Unable to load this profile."));
  }
})();
