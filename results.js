import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"; import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"; import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0", authDomain: "nunsa-voting-app.firebaseapp.com", projectId: "nunsa-voting-app", storageBucket: "nunsa-voting-app.firebasestorage.app", messagingSenderId: "1069853481069", appId: "1:1069853481069:web:63ebcca28764", measurementId: "G-EMYNQR6T0F" };

const app = initializeApp(firebaseConfig); const auth = getAuth(app); const db = getFirestore(app);

const params = new URLSearchParams(window.location.search); const electionId = params.get("id");

const electionTitle = document.getElementById("election-title"); const electionDescription = document.getElementById("election-description"); const electionStatus = document.getElementById("election-status"); const totalVotesElement = document.getElementById("total-votes"); const candidateCountElement = document.getElementById("candidate-count"); const resultsList = document.getElementById("results-list"); const resultImageMessage = document.getElementById("result-image-message"); const generateResultImageBtn = document.getElementById("generate-result-image-btn"); const resultImagePreview = document.getElementById("result-image-preview"); const downloadResultImageBtn = document.getElementById("download-result-image-btn"); const backBtn = document.getElementById("back-btn");

let currentResults = null; let currentUser = null; let currentUserIsAdmin = false;

function showMessage(message, type = "error") { resultsList.innerHTML = "";

const messageElement = document.createElement("p"); messageElement.textContent = message; messageElement.className = type === "error" ? "error-message" : "success-message"; resultsList.appendChild(messageElement); 

}

function formatStatus(status) { if (status === "active") { return "Election in progress"; }

if (status === "ended") { return "Election Ended"; } if (status === "upcoming") { return "Election has not started"; } return "Unknown status"; 

}

function renderStatus(status) { electionStatus.textContent = formatStatus(status);

electionStatus.classList.remove( "active", "upcoming", "ended" ); electionStatus.classList.add(status); 

}

function renderResultsBase(data) {
    currentResults = data;

    electionTitle.textContent = data.election?.title || "Election Results";
    electionDescription.textContent = data.election?.description || "";
    totalVotesElement.textContent = Number(data.totalVotes || 0).toLocaleString();

    const positions = Array.isArray(data.positions) ? data.positions : [];
    const candidateCount = positions.reduce((total, position) => {
        return total + (Array.isArray(position.candidates) ? position.candidates.length : 0);
    }, 0);

    candidateCountElement.textContent = candidateCount.toLocaleString();
    renderStatus(data.electionStatus);
    resultsList.innerHTML = "";

    if (positions.length === 0) {
        showMessage("No candidates found for this election.", "error");
        return;
    }

    positions.forEach(positionData => {
        const positionSection = document.createElement("div");
        positionSection.className = "position-results";

        const positionTitle = document.createElement("h3");
        positionTitle.textContent = positionData.position || "Unspecified Position";
        positionSection.appendChild(positionTitle);

        const positionTotalVotes = Number(positionData.totalVotes || 0);
        const positionTotal = document.createElement("p");
        positionTotal.textContent = `Total votes for this position: ${positionTotalVotes.toLocaleString()}`;
        positionSection.appendChild(positionTotal);

        const candidates = Array.isArray(positionData.candidates) ? positionData.candidates : [];
        const maxVotes = Math.max(...candidates.map(candidate => Number(candidate.votes || 0)), 1);

        candidates.forEach(candidate => {
            const card = document.createElement("div");
            card.className = "result-card";

            const header = document.createElement("div");
            header.className = "result-card-header";

            const image = document.createElement("img");
            image.src = candidate.profilePicture || "assets/default-profile.jpg";
            image.alt = candidate.name || "Candidate";
            image.onerror = function() {
                image.src = "assets/default-profile.jpg";
            };

            const info = document.createElement("div");
            info.className = "result-card-info";

            const name = document.createElement("h3");
            name.textContent = candidate.name || "Unnamed Candidate";

            const votes = Number(candidate.votes || 0);
            const percentageValue = positionTotalVotes > 0 ? (votes / positionTotalVotes) * 100 : 0;
            const percentageLabel = `${percentageValue.toFixed(1)}%`;

            const percentageRing = document.createElement("div");
            percentageRing.className = "candidate-vote-ring";
            percentageRing.style.setProperty("--vote-percent", `${Math.min(100, Math.max(0, percentageValue))}%`);
            percentageRing.setAttribute("role", "img");
            percentageRing.setAttribute("aria-label", `${percentageLabel} of votes for this position`);

            const ringLabel = document.createElement("span");
            ringLabel.textContent = percentageLabel;
            percentageRing.appendChild(ringLabel);

            const voteCount = document.createElement("div");
            voteCount.className = "vote-count";
            voteCount.textContent = `${votes.toLocaleString()} vote${votes === 1 ? "" : "s"}`;

            const bar = document.createElement("div");
            bar.className = "result-bar";
            bar.setAttribute("aria-hidden", "true");

            const barFill = document.createElement("div");
            barFill.className = "result-bar-fill";
            barFill.style.width = `${(votes / maxVotes) * 100}%`;
            bar.appendChild(barFill);

            info.appendChild(name);
            info.appendChild(voteCount);
            info.appendChild(bar);
            header.appendChild(image);
            header.appendChild(percentageRing);
            header.appendChild(info);
            card.appendChild(header);
            positionSection.appendChild(card);
        });

        resultsList.appendChild(positionSection);
    });

    if (data.electionStatus === "ended") {
        resultImageMessage.textContent = "The election has ended. You can generate and download the official final result image.";
        generateResultImageBtn.style.display = "block";
    } else {
        resultImageMessage.textContent = "The official result image will become available after the election ends.";
        generateResultImageBtn.style.display = "none";
        downloadResultImageBtn.style.display = "none";
        resultImagePreview.innerHTML = "";
    }
}

async function checkAdminStatus(user) { try { const adminRef = doc( db, "admins", user.uid );

const adminSnapshot = await getDoc(adminRef); if (!adminSnapshot.exists()) { return false; } const adminData = adminSnapshot.data(); return ( adminData.active === true && ( adminData.role === "admin" || adminData.role === "super_admin" ) ); } catch (error) { console.error( "Admin status check error:", error ); return false; } 

}

const CHART_COLORS = ["#4f8f9a", "#12404a", "#d99a3d", "#c96f5b", "#7c8a8e", "#6b5b95", "#a9cdd2", "#b8a05a"];

// first 8 candidates use the fixed palette; any more get evenly spread generated hues, so no colour repeats
function chartColor(index) {
    if (index < CHART_COLORS.length) return CHART_COLORS[index];
    return "hsl(" + Math.round((index * 137.508) % 360) + " 45% 48%)";
}

function renderResults(data) {
    renderResultsBase(data);
    try { decoratePositions(data); } catch (error) { console.error("Chart error:", error); }
}

function decoratePositions(data) {
    const NS = "http://www.w3.org/2000/svg";
    const old = document.getElementById("results-charts");
    if (old) old.remove();

    const positions = Array.isArray(data.positions) ? data.positions : [];
    const sections = resultsList.querySelectorAll(".position-results");
    const ended = data.electionStatus === "ended";
    const C = 2 * Math.PI * 46;

    positions.forEach((positionData, p) => {
        const section = sections[p];
        if (!section) return;

        const candidates = Array.isArray(positionData.candidates) ? positionData.candidates : [];
        const cards = section.querySelectorAll(".result-card");
        const votesList = candidates.map(c => Number(c.votes || 0));
        const total = votesList.reduce((sum, v) => sum + v, 0);

        // colour each candidate's bar and add the percentage next to the vote count
        candidates.forEach((c, i) => {
            const card = cards[i];
            if (!card) return;
            const fill = card.querySelector(".result-bar-fill");
            if (fill) fill.style.background = chartColor(i);
            const count = card.querySelector(".vote-count");
            if (count && total > 0) count.textContent += " \u00b7 " + ((votesList[i] / total) * 100).toFixed(1) + "%";
        });

        if (!candidates.length || !cards.length) return;

        const topVotes = Math.max.apply(null, votesList);
        const leaders = candidates.filter((c, i) => votesList[i] === topVotes);
        const tie = total > 0 && leaders.length > 1;

        const strip = document.createElement("div");
        strip.className = "position-summary";

        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 120 120");
        svg.setAttribute("class", "donut");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", (positionData.position || "Position") + " vote share");

        const track = document.createElementNS(NS, "circle");
        ["cx:60", "cy:60", "r:46", "fill:none", "stroke:#ece9df", "stroke-width:14"].forEach(pair => {
            const [k, v] = pair.split(":"); track.setAttribute(k, v);
        });
        svg.appendChild(track);

        let used = 0;
        if (total > 0) {
            votesList.forEach((v, i) => {
                if (!v) return;
                const length = (v / total) * C;
                const seg = document.createElementNS(NS, "circle");
                seg.setAttribute("cx", "60"); seg.setAttribute("cy", "60"); seg.setAttribute("r", "46");
                seg.setAttribute("fill", "none");
                seg.setAttribute("stroke", chartColor(i));
                seg.setAttribute("stroke-width", "14");
                seg.setAttribute("stroke-dasharray", length + " " + (C - length));
                seg.setAttribute("stroke-dashoffset", String(-used));
                seg.setAttribute("transform", "rotate(-90 60 60)");
                svg.appendChild(seg);
                used += length;
            });
        }
        const big = document.createElementNS(NS, "text");
        big.setAttribute("x", "60"); big.setAttribute("y", "66"); big.setAttribute("text-anchor", "middle");
        big.setAttribute("class", "donut-big");
        big.textContent = total ? Math.round((topVotes / total) * 100) + "%" : "0";
        svg.appendChild(big);
        strip.appendChild(svg);

        const text = document.createElement("div");
        text.className = "summary-text";
        const label = document.createElement("span");
        label.className = "summary-label";
        label.textContent = !total ? "No votes yet" : tie ? "Tie" : ended ? "Winner" : "Leading";
        const who = document.createElement("strong");
        who.textContent = !total ? "Waiting for the first vote"
            : leaders.map(c => c.name || "Unnamed candidate").join(" & ");
        const meta = document.createElement("span");
        meta.className = "summary-meta";
        meta.textContent = total ? topVotes.toLocaleString() + " of " + total.toLocaleString() + " vote" + (total === 1 ? "" : "s") : "";
        text.appendChild(label); text.appendChild(who);
        if (total) text.appendChild(meta);
        strip.appendChild(text);

        section.insertBefore(strip, cards[0]);
    });
}

let resultsRequestInProgress = false;

async function loadResults() {
    if (!electionId) {
        showMessage("No election was selected.");
        electionTitle.textContent = "Election Results";
        electionStatus.textContent = "Invalid election.";
        return;
    }

    if (!currentUser || resultsRequestInProgress) return;

    resultsRequestInProgress = true;
    try {
        if (!currentResults) electionStatus.textContent = "Loading election results...";
        const token = await currentUser.getIdToken();
        const response = await fetch(
            `/.netlify/functions/get-election-results?id=${encodeURIComponent(electionId)}`,
            {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store"
            }
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load election results.");
        }

        renderResults(data);
        if (currentUserIsAdmin && data.electionStatus === "ended" && !data.finalized) {
            await finalizeResults(token);
        }
    } catch (error) {
        console.error(error);
        if (!currentResults) {
            showMessage(error.message || "Unable to load election results.");
            electionStatus.textContent = "Unable to load results.";
        }
    } finally {
        resultsRequestInProgress = false;
    }
}

async function finalizeResults(token) { try { const response = await fetch( "/.netlify/functions/finalize-election-results", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ electionId }) } );

const data = await response.json(); if (!response.ok || !data.success) { throw new Error( data.message || "Unable to finalize results." ); } if (data.result) { currentResults = { ...currentResults, finalized: true, positions: data.result.positions || [], totalVotes: data.result.totalVotes || 0 }; renderResults(currentResults); } } catch (error) { console.error( "Finalization error:", error ); } 

}

function loadImage(src) { return new Promise(resolve => { const image = new Image();

image.onload = () => { resolve(image); }; image.onerror = () => { resolve(null); }; image.src = src; }); 

}

async function generateResultImage() { if ( !currentResults || currentResults.electionStatus !== "ended" ) { return; }

generateResultImageBtn.disabled = true; generateResultImageBtn.textContent = "GENERATING..."; try { const positions = Array.isArray(currentResults.positions) ? currentResults.positions : []; const width = 1000; const headerHeight = 300; const positionHeaderHeight = 90; const rowHeight = 150; const footerHeight = 100; let totalRows = 0; positions.forEach(positionData => { totalRows += 1; totalRows += Array.isArray(positionData.candidates) ? positionData.candidates.length : 0; }); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = headerHeight + totalRows * rowHeight + footerHeight; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect( 0, 0, canvas.width, canvas.height ); ctx.fillStyle = "#4f8f9a"; ctx.fillRect( 0, 0, canvas.width, headerHeight ); const logo = await loadImage( "assets/nunsa-logo.png" ); if (logo) { const logoSize = 90; ctx.save(); ctx.beginPath(); ctx.arc( width / 2, 58, logoSize / 2, 0, Math.PI * 2 ); ctx.clip(); ctx.drawImage( logo, width / 2 - logoSize / 2, 58 - logoSize / 2, logoSize, logoSize ); ctx.restore(); } ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "bold 32px Arial"; ctx.fillText( "NUNSA-FUD", width / 2, 125 ); ctx.font = "bold 28px Arial"; ctx.fillText( currentResults.election?.title || "Election Results", width / 2, 170 ); ctx.font = "bold 23px Arial"; ctx.fillText( "FINAL RESULTS", width / 2, 210 ); ctx.font = "20px Arial"; ctx.fillText( `Total Votes Cast: ${Number( currentResults.totalVotes || 0 ).toLocaleString()}`, width / 2, 250 ); const allCandidates = []; positions.forEach(positionData => { const candidates = Array.isArray(positionData.candidates) ? positionData.candidates : []; candidates.forEach(candidate => { allCandidates.push({ candidate, position: positionData.position || "" }); }); }); const imagePromises = allCandidates.map(item => { return new Promise(resolve => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => { resolve({ candidate: item.candidate, position: item.position, image }); }; image.onerror = () => { resolve({ candidate: item.candidate, position: item.position, image: null }); }; image.src = item.candidate.profilePicture || "assets/default-profile.jpg"; }); }); const loadedCandidates = await Promise.all(imagePromises); let y = headerHeight; let candidateIndex = 0; positions.forEach(positionData => { const position = positionData.position || "Unspecified Position"; const candidates = Array.isArray(positionData.candidates) ? positionData.candidates : []; ctx.fillStyle = "#f2f4f5"; ctx.fillRect( 0, y, width, positionHeaderHeight ); ctx.fillStyle = "#4f8f9a"; ctx.textAlign = "left"; ctx.font = "bold 28px Arial"; ctx.fillText( position, 50, y + 38 ); ctx.font = "18px Arial"; ctx.fillText( `Total votes: ${Number( positionData.totalVotes || 0 ).toLocaleString()}`, 50, y + 68 ); y += positionHeaderHeight; candidates.forEach(candidate => { const item = loadedCandidates[candidateIndex++]; ctx.strokeStyle = "#dddddd"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo( 40, y + rowHeight ); ctx.lineTo( width - 40, y + rowHeight ); ctx.stroke(); if (item && item.image) { ctx.save(); ctx.beginPath(); ctx.arc( 100, y + 65, 48, 0, Math.PI * 2 ); ctx.clip(); ctx.drawImage( item.image, 52, y + 17, 96, 96 ); ctx.restore(); } ctx.fillStyle = "#222222"; ctx.textAlign = "left"; ctx.font = "bold 25px Arial"; ctx.fillText( candidate.name || "Unnamed Candidate", 180, y + 48 ); ctx.font = "bold 22px Arial"; ctx.fillText( `${Number( candidate.votes || 0 ).toLocaleString()} votes`, 180, y + 92 ); ctx.textAlign = "right"; ctx.font = "bold 24px Arial"; ctx.fillText( `${Number( candidate.percentage || 0 ).toFixed(2)}%`, width - 60, y + 60 ); y += rowHeight; }); }); ctx.fillStyle = "#4f8f9a"; ctx.fillRect( 0, canvas.height - footerHeight, width, footerHeight ); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial"; ctx.fillText( "NUNSA-FUD Official Election Result", width / 2, canvas.height - 55 ); const dataUrl = canvas.toDataURL("image/png"); resultImagePreview.innerHTML = ""; const previewImage = document.createElement("img"); previewImage.src = dataUrl; previewImage.alt = "Final election result"; previewImage.style.maxWidth = "100%"; previewImage.style.display = "block"; previewImage.style.margin = "20px auto"; resultImagePreview.appendChild( previewImage ); downloadResultImageBtn.style.display = "block"; downloadResultImageBtn.onclick = function() { const link = document.createElement("a"); link.href = dataUrl; link.download = `${( currentResults.election?.title || "NUNSA-FUD-Results" ) .replace( /[^a-z0-9]+/gi, "-" ) .replace( /^-+|-+$/g, "" ) .toLowerCase()}.png`; link.click(); }; resultImageMessage.textContent = "Final result image generated successfully."; } catch (error) { console.error( "Result image error:", error ); resultImageMessage.textContent = "Unable to generate the result image. Please try again."; } finally { generateResultImageBtn.disabled = false; generateResultImageBtn.textContent = "GENERATE RESULT IMAGE"; } 

}

generateResultImageBtn.addEventListener( "click", generateResultImage );

backBtn.addEventListener( "click", function() { window.history.back(); } );

onAuthStateChanged(auth, async user => {
    currentUser = user;

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    currentUserIsAdmin = await checkAdminStatus(user);
    await loadResults();
});

// Refresh results periodically while the election is upcoming or in progress.
// 30 seconds (was 10) keeps the live feel but cuts server calls and Firestore
// reads by two thirds. Paused while the tab is hidden; refreshes at once when
// the student comes back to the tab.
const RESULTS_REFRESH_MS = 30000;

function shouldRefreshResults() {
    const status = currentResults?.electionStatus;
    return currentUser && !document.hidden && (!status || status === "upcoming" || status === "active");
}

setInterval(() => {
    if (shouldRefreshResults()) {
        loadResults();
    }
}, RESULTS_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
    if (shouldRefreshResults()) {
        loadResults();
    }
});
