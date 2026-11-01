import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0", authDomain: "nunsa-voting-app.firebaseapp.com", projectId: "nunsa-voting-app", storageBucket: "nunsa-voting-app.firebasestorage.app", messagingSenderId: "1069853481069", appId: "1:1069853481069:web:63ebcca28764", measurementId: "G-EMYNQR6T0F" };

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const adminName = document.getElementById("admin-name");

const adminRole = document.getElementById("admin-role");

const logoutBtn = document.getElementById("logout-btn");

const superAdminSection = document.getElementById("super-admin-section");

const adminManagementBtn = document.getElementById("admin-management-btn");

const electionsBtn = document.getElementById("elections-btn");

const candidatesBtn = document.getElementById("candidates-btn");

const votersBtn = document.getElementById("voters-btn");

const resultsBtn = document.getElementById("results-btn");

const studentsBtn = document.getElementById("students-btn");

const formsBtn = document.getElementById("forms-btn");
const announcementsBtn = document.getElementById("announcements-btn");

onAuthStateChanged(auth, async (user) => {

if (!user) { window.location.href = "admin-login.html"; return; } try { const adminRef = doc( db, "admins", user.uid ); const adminSnapshot = await getDoc(adminRef); if (!adminSnapshot.exists()) { console.error( "Admin record not found." ); await signOut(auth); window.location.href = "admin-login.html"; return; } const adminData = adminSnapshot.data(); if (adminData.active !== true) { console.error( "Admin account is inactive." ); await signOut(auth); window.location.href = "admin-login.html"; return; } if ( adminData.role !== "admin" && adminData.role !== "super_admin" ) { console.error( "Invalid administrator role." ); await signOut(auth); window.location.href = "admin-login.html"; return; } adminName.textContent = adminData.name || "Administrator"; adminRole.textContent = adminData.role === "super_admin" ? "Super Admin" : "Admin"; if ( adminData.role === "super_admin" ) { superAdminSection.style.display = "block"; votersBtn.style.display = "block"; } else { superAdminSection.style.display = "none"; votersBtn.style.display = "none"; } } catch (error) { console.error( "Admin verification error:", error ); await signOut(auth); window.location.href = "admin-login.html"; } 

});

electionsBtn.addEventListener( "click", () => {

window.location.href = "elections.html"; } 

);

candidatesBtn.addEventListener( "click", () => {

window.location.href = "elections.html?next=candidates.html"; } 

);

votersBtn.addEventListener( "click", () => {

window.location.href = "elections.html?next=voters.html"; } 

);

resultsBtn.addEventListener( "click", () => {

window.location.href = "admin-results.html"; } 

);

studentsBtn.addEventListener( "click", () => {

window.location.href = "students.html"; } 

);

adminManagementBtn.addEventListener( "click", () => {

window.location.href = "admin-management.html"; } 

);

logoutBtn.addEventListener( "click", async () => {

try { await signOut(auth); window.location.href = "admin-login.html"; } catch (error) { console.error( "Logout error:", error ); } } 

);

formsBtn.addEventListener("click", () => { window.location.href = "forms.html"; });
announcementsBtn.addEventListener("click", () => { window.location.href = "admin-announcements.html"; });
