import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    setDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-3bioPt3VR_swJ5ItGJY7PJbo8AD7nf0",
    authDomain: "nunsa-voting-app.firebaseapp.com",
    projectId: "nunsa-voting-app",
    storageBucket: "nunsa-voting-app.firebasestorage.app",
    messagingSenderId: "1069853481069",
    appId: "1:1069853481069:web:63ebcca28764",
    measurementId: "G-EMYNQR6T0F"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const backDashboardButton =
    document.getElementById("back-dashboard-btn");

const addStudentButton =
    document.getElementById("add-student-btn");

const importStudentsButton =
    document.getElementById("import-students-btn");

const studentSearch =
    document.getElementById("student-search");

const studentList =
    document.getElementById("student-list");

let allStudents = [];

function normalizeMatric(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function matricDocumentId(matricNumber) {
    return normalizeMatric(matricNumber)
        .replace(/[^A-Z0-9]/g, "_");
}

function showPageMessage(message) {
    studentList.innerHTML = "";

    const messageElement =
        document.createElement("p");

    messageElement.textContent =
        message;

    studentList.appendChild(
        messageElement
    );
}

async function checkAdmin(user) {
    const adminRef =
        doc(
            db,
            "admins",
            user.uid
        );

    const adminSnapshot =
        await getDoc(adminRef);

    if (!adminSnapshot.exists()) {
        throw new Error(
            "This account is not registered as an administrator."
        );
    }

    const adminData =
        adminSnapshot.data();

    if (adminData.active !== true) {
        throw new Error(
            "This administrator account is inactive."
        );
    }

    if (
        adminData.role !== "admin" &&
        adminData.role !== "super_admin"
    ) {
        throw new Error(
            "This account does not have administrator access."
        );
    }

    return adminData;
}

async function saveNewStudent(
    matricNumber,
    name
) {
    const normalizedMatric =
        normalizeMatric(
            matricNumber
        );

    const studentName =
        String(name || "").trim();

    if (!normalizedMatric) {
        throw new Error(
            "Matric number is required."
        );
    }

    if (!studentName) {
        throw new Error(
            "Student name is required."
        );
    }

    const studentDocumentId =
        matricDocumentId(
            normalizedMatric
        );

    const studentRef =
        doc(
            db,
            "students",
            studentDocumentId
        );

    const studentSnapshot =
        await getDoc(studentRef);

    const studentData = {
        matricNumber:
            normalizedMatric,

        name:
            studentName,

        status:
            "active",

        updatedAt:
            serverTimestamp()
    };

    if (!studentSnapshot.exists()) {
        studentData.createdAt =
            serverTimestamp();
    }

    await setDoc(
        studentRef,
        studentData,
        {
            merge: true
        }
    );

    const accessRef =
        doc(
            db,
            "studentAccess",
            studentDocumentId
        );

    await setDoc(
        accessRef,
        {
            matricNumber:
                normalizedMatric,

            studentDocumentId:
                studentDocumentId,

            active:
                true,

            updatedAt:
                serverTimestamp(),

            createdAt:
                serverTimestamp()
        },
        {
            merge: true
        }
    );
}

async function importStudentBatch(
    studentListData
) {
    const validStudents = [];

    const seenMatricNumbers =
        new Set();

    for (
        const student
        of studentListData
    ) {
        const matricNumber =
            normalizeMatric(
                student.matricNumber
            );

        const name =
            String(
                student.name || ""
            ).trim();

        if (
            !matricNumber ||
            !name
        ) {
            continue;
        }

        if (
            seenMatricNumbers.has(
                matricNumber
            )
        ) {
            continue;
        }

        seenMatricNumbers.add(
            matricNumber
        );

        validStudents.push({
            matricNumber,
            name
        });
    }

    if (!validStudents.length) {
        throw new Error(
            "No valid student records were found in the file."
        );
    }

    const batchLimit = 200;

    let importedCount = 0;

    for (
        let start = 0;
        start < validStudents.length;
        start += batchLimit
    ) {
        const batch =
            writeBatch(db);

        const batchStudents =
            validStudents.slice(
                start,
                start + batchLimit
            );

        for (
            const student
            of batchStudents
        ) {
            const studentDocumentId =
                matricDocumentId(
                    student.matricNumber
                );

            const studentRef =
                doc(
                    db,
                    "students",
                    studentDocumentId
                );

            const accessRef =
                doc(
                    db,
                    "studentAccess",
                    studentDocumentId
                );

            batch.set(
                studentRef,
                {
                    matricNumber:
                        student.matricNumber,

                    name:
                        student.name,

                    status:
                        "active",

                    updatedAt:
                        serverTimestamp(),

                    createdAt:
                        serverTimestamp()
                },
                {
                    merge: true
                }
            );

            batch.set(
                accessRef,
                {
                    matricNumber:
                        student.matricNumber,

                    studentDocumentId:
                        studentDocumentId,

                    active:
                        true,

                    updatedAt:
                        serverTimestamp(),

                    createdAt:
                        serverTimestamp()
                },
                {
                    merge: true
                }
            );
        }

        await batch.commit();

        importedCount +=
            batchStudents.length;

        studentList.innerHTML =
            "<p>Importing " +
            importedCount +
            " of " +
            validStudents.length +
            " students...</p>";
    }

    return importedCount;
}

async function loadStudents() {
    showPageMessage(
        "Loading students..."
    );

    try {
        const studentsRef =
            collection(
                db,
                "students"
            );

        const studentsQuery =
            query(
                studentsRef,
                orderBy("name")
            );

        const snapshot =
            await getDocs(
                studentsQuery
            );

        allStudents = [];

        snapshot.forEach(
            (studentDocument) => {
                allStudents.push({
                    id:
                        studentDocument.id,

                    ...studentDocument.data()
                });
            }
        );

        renderStudents(
            allStudents
        );

    } catch (error) {
        console.error(
            "Load students error:",
            error
        );

        showPageMessage(
            "Unable to load students. Please refresh the page."
        );
    }
}

function renderStudents(
    students
) {
    studentList.innerHTML = "";

    if (!students.length) {
        const emptyMessage =
            document.createElement("p");

        emptyMessage.textContent =
            "No students found.";

        studentList.appendChild(
            emptyMessage
        );

        return;
    }

    students.forEach(
        (student) => {
            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "student-card";

            const name =
                document.createElement(
                    "h3"
                );

            name.textContent =
                student.name ||
                "Unnamed Student";

            const matric =
                document.createElement(
                    "p"
                );

            matric.innerHTML =
                "<strong>Registration Number:</strong> ";

            matric.appendChild(
                document.createTextNode(
                    student.matricNumber ||
                    ""
                )
            );

            const status =
                document.createElement(
                    "p"
                );

            status.innerHTML =
                "<strong>Status:</strong> ";

            status.appendChild(
                document.createTextNode(
                    student.status ||
                    "active"
                )
            );

            card.appendChild(
                name
            );

            card.appendChild(
                matric
            );

            card.appendChild(
                status
            );

            studentList.appendChild(
                card
            );
        }
    );
}

function filterStudents() {
    const searchTerm =
        normalizeMatric(
            studentSearch.value
        );

    if (!searchTerm) {
        renderStudents(
            allStudents
        );

        return;
    }

    const filteredStudents =
        allStudents.filter(
            (student) => {
                const matric =
                    normalizeMatric(
                        student.matricNumber
                    );

                const name =
                    normalizeMatric(
                        student.name
                    );

                return (
                    matric.includes(
                        searchTerm
                    ) ||
                    name.includes(
                        searchTerm
                    )
                );
            }
        );

    renderStudents(
        filteredStudents
    );
}

function addSingleStudent() {
    const matricNumber =
        prompt(
            "Enter the student's registration number:"
        );

    if (
        matricNumber === null
    ) {
        return;
    }

    const name =
        prompt(
            "Enter the student's full name:"
        );

    if (
        name === null
    ) {
        return;
    }

    addStudentButton.disabled =
        true;

    addStudentButton.textContent =
        "ADDING...";

    saveNewStudent(
        matricNumber,
        name
    )
        .then(
            async () => {
                alert(
                    "Student added successfully."
                );

                await loadStudents();
            }
        )
        .catch(
            (error) => {
                console.error(
                    "Add student error:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to add student."
                );
            }
        )
        .finally(
            () => {
                addStudentButton.disabled =
                    false;

                addStudentButton.innerHTML =
                    "<h3>Add Student</h3><p>Add one student using their registration number.</p>";
            }
        );
}

function importStudents() {
    const input =
        document.createElement(
            "input"
        );

    input.type =
        "file";

    input.accept =
        ".csv,.xlsx,.xls";

    input.style.display =
        "none";

    document.body.appendChild(
        input
    );

    input.addEventListener(
        "change",
        async () => {
            const file =
                input.files[0];

            if (!file) {
                input.remove();

                return;
            }

            importStudentsButton.disabled =
                true;

            importStudentsButton.textContent =
                "IMPORTING...";

            try {
                const fileData =
                    await file.arrayBuffer();

                const workbook =
                    XLSX.read(
                        fileData,
                        {
                            type: "array"
                        }
                    );

                const firstSheet =
                    workbook.Sheets[
                        workbook.SheetNames[0]
                    ];

                const rows =
                    XLSX.utils.sheet_to_json(
                        firstSheet,
                        {
                            defval: ""
                        }
                    );

                const studentListData =
                    rows.map(
                        (row) => ({
                            matricNumber:
                                row.matricNumber ||
                                row.MatricNumber ||
                                row["Matric Number"] ||
                                row.registrationNumber ||
                                row["Registration Number"] ||
                                "",

                            name:
                                row.name ||
                                row.Name ||
                                row["Student Name"] ||
                                ""
                        })
                    );

                const importedCount =
                    await importStudentBatch(
                        studentListData
                    );

                await loadStudents();

                alert(
                    importedCount +
                    " student(s) imported successfully."
                );

            } catch (error) {
                console.error(
                    "Import students error:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to import students."
                );

            } finally {
                importStudentsButton.disabled =
                    false;

                importStudentsButton.innerHTML =
                    "<h3>Import Students</h3><p>Add many students using CSV or Excel.</p>";

                input.remove();
            }
        }
    );

    input.click();
}

backDashboardButton.addEventListener(
    "click",
    () => {
        window.location.href =
            "admin.html";
    }
);

addStudentButton.addEventListener(
    "click",
    addSingleStudent
);

importStudentsButton.addEventListener(
    "click",
    importStudents
);

studentSearch.addEventListener(
    "input",
    filterStudents
);

onAuthStateChanged(
    auth,
    async (user) => {
        if (!user) {
            window.location.href =
                "admin-login.html";

            return;
        }

        try {
            await checkAdmin(
                user
            );

            await loadStudents();

        } catch (error) {
            console.error(
                "Student management authentication error:",
                error
            );

            showPageMessage(
                error.message ||
                "Administrator access could not be verified."
            );
        }
    }
);