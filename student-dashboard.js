import { initStudentPage } from "./student-page.js";

const messageSection = document.getElementById("student-message-section");
const dashboardMessage = document.getElementById("student-dashboard-message");

try {
  await initStudentPage();
} catch (error) {
  console.error("Student dashboard setup error:", error);
  if (messageSection && dashboardMessage) {
    messageSection.hidden = false;
    dashboardMessage.textContent = "Unable to load your account. Refresh the page or log in again.";
  }
}
