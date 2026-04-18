import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js?v=auth-fix-20260418";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const defaultState = {
  user: null,
  profile: {
    studentName: "",
    collegeName: "",
    branchName: "",
    semesterName: "2nd Semester",
    sectionName: "",
    goalName: "",
  },
  timetable: [],
  classNotes: [],
  techNotes: [],
  dailyWork: [],
};

let app;
let auth;
let db;
let state = structuredClone(defaultState);
let unsubscribers = [];

const elements = {
  setupNotice: document.querySelector("#setupNotice"),
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  showLoginBtn: document.querySelector("#showLoginBtn"),
  showRegisterBtn: document.querySelector("#showRegisterBtn"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  authMessage: document.querySelector("#authMessage"),
  profileForm: document.querySelector("#profileForm"),
  loggedInAs: document.querySelector("#loggedInAs"),
  logoutBtn: document.querySelector("#logoutBtn"),
  studentName: document.querySelector("#studentName"),
  collegeName: document.querySelector("#collegeName"),
  branchName: document.querySelector("#branchName"),
  semesterName: document.querySelector("#semesterName"),
  sectionName: document.querySelector("#sectionName"),
  goalName: document.querySelector("#goalName"),
  exportBtn: document.querySelector("#exportBtn"),
  timetableForm: document.querySelector("#timetableForm"),
  scheduleDay: document.querySelector("#scheduleDay"),
  scheduleStartTime: document.querySelector("#scheduleStartTime"),
  scheduleEndTime: document.querySelector("#scheduleEndTime"),
  scheduleSubject: document.querySelector("#scheduleSubject"),
  scheduleRoom: document.querySelector("#scheduleRoom"),
  timetableList: document.querySelector("#timetableList"),
  classNoteForm: document.querySelector("#classNoteForm"),
  classNotesList: document.querySelector("#classNotesList"),
  techNoteForm: document.querySelector("#techNoteForm"),
  techNotesList: document.querySelector("#techNotesList"),
  dailyWorkForm: document.querySelector("#dailyWorkForm"),
  dailyWorkList: document.querySelector("#dailyWorkList"),
  workFiles: document.querySelector("#workFiles"),
  subjectCount: document.querySelector("#subjectCount"),
  noteCount: document.querySelector("#noteCount"),
  fileCount: document.querySelector("#fileCount"),
};

initialize();

async function initialize() {
  bindAuthControls();
  bindAppControls();

  if (!isFirebaseConfigured(firebaseConfig)) {
    elements.setupNotice.classList.remove("hidden");
    setAuthMessage("Update firebase-config.js before using the app.");
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    cleanupSubscriptions();

    if (!user) {
      state = structuredClone(defaultState);
      showAuth();
      return;
    }

    state.user = {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
    };

    await ensureUserDocument(user);
    subscribeToUserData(user.uid);
    showApp();
  });
}

function bindAuthControls() {
  elements.showLoginBtn.addEventListener("click", () => switchAuthMode("login"));
  elements.showRegisterBtn.addEventListener("click", () => switchAuthMode("register"));

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Logging in...");

    try {
      await signInWithEmailAndPassword(
        auth,
        document.querySelector("#loginEmail").value.trim(),
        document.querySelector("#loginPassword").value,
      );
      elements.loginForm.reset();
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(readableError(error));
    }
  });

  elements.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Creating account...");

    const name = document.querySelector("#registerName").value.trim();
    const email = document.querySelector("#registerEmail").value.trim();
    const password = document.querySelector("#registerPassword").value;

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDocument(credential.user, name);
      elements.registerForm.reset();
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(readableError(error));
    }
  });
}

function bindAppControls() {
  elements.logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userDocRef = doc(db, "users", state.user.uid);
    const profile = {
      studentName: elements.studentName.value.trim(),
      collegeName: elements.collegeName.value.trim(),
      branchName: elements.branchName.value.trim(),
      semesterName: elements.semesterName.value.trim() || "2nd Semester",
      sectionName: elements.sectionName.value.trim(),
      goalName: elements.goalName.value.trim(),
    };

    await setDoc(
      userDocRef,
      {
        ...profile,
        email: state.user.email,
        name: profile.studentName || state.user.name || "",
        updatedAtMs: Date.now(),
      },
      { merge: true },
    );
  });

  elements.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "campus-companion-export.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  elements.timetableForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addDoc(collection(db, "users", state.user.uid, "timetable"), {
      day: elements.scheduleDay.value,
      startTime: elements.scheduleStartTime.value,
      endTime: elements.scheduleEndTime.value,
      subject: elements.scheduleSubject.value.trim(),
      room: elements.scheduleRoom.value.trim(),
      createdAtMs: Date.now(),
    });
    elements.timetableForm.reset();
  });

  elements.classNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addDoc(collection(db, "users", state.user.uid, "classNotes"), {
      title: document.querySelector("#classTitle").value.trim(),
      subject: document.querySelector("#classSubject").value.trim(),
      date: document.querySelector("#classDate").value,
      content: document.querySelector("#classContent").value.trim(),
      createdAtMs: Date.now(),
    });
    elements.classNoteForm.reset();
  });

  elements.techNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addDoc(collection(db, "users", state.user.uid, "techNotes"), {
      title: document.querySelector("#techTitle").value.trim(),
      tag: document.querySelector("#techTag").value.trim(),
      date: document.querySelector("#techDate").value,
      content: document.querySelector("#techContent").value.trim(),
      createdAtMs: Date.now(),
    });
    elements.techNoteForm.reset();
  });

  elements.dailyWorkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addDoc(collection(db, "users", state.user.uid, "dailyWork"), {
      date: document.querySelector("#workDate").value,
      title: document.querySelector("#workTitle").value.trim(),
      focus: document.querySelector("#workFocus").value.trim(),
      summary: document.querySelector("#workSummary").value.trim(),
      createdAtMs: Date.now(),
    });

    elements.dailyWorkForm.reset();
  });
}

async function ensureUserDocument(user, overrideName = "") {
  const userDocRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userDocRef);
  if (snapshot.exists()) return;

  await setDoc(userDocRef, {
    name: overrideName || user.displayName || "",
    email: user.email || "",
    ...defaultState.profile,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  });
}

function subscribeToUserData(uid) {
  unsubscribers.push(
    onSnapshot(doc(db, "users", uid), (snapshot) => {
      const data = snapshot.data() || {};
      state.profile = {
        studentName: data.studentName || "",
        collegeName: data.collegeName || "",
        branchName: data.branchName || "",
        semesterName: data.semesterName || "2nd Semester",
        sectionName: data.sectionName || "",
        goalName: data.goalName || "",
      };
      state.user.name = data.name || state.user.name || "";
      renderAll();
    }),
  );

  unsubscribers.push(
    onSnapshot(query(collection(db, "users", uid, "timetable"), orderBy("createdAtMs", "desc")), (snapshot) => {
      state.timetable = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
  );

  unsubscribers.push(
    onSnapshot(query(collection(db, "users", uid, "classNotes"), orderBy("createdAtMs", "desc")), (snapshot) => {
      state.classNotes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
  );

  unsubscribers.push(
    onSnapshot(query(collection(db, "users", uid, "techNotes"), orderBy("createdAtMs", "desc")), (snapshot) => {
      state.techNotes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
  );

  unsubscribers.push(
    onSnapshot(query(collection(db, "users", uid, "dailyWork"), orderBy("createdAtMs", "desc")), (snapshot) => {
      state.dailyWork = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    }),
  );
}

function cleanupSubscriptions() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}

async function uploadDailyFiles(recordId, files) {
  // File upload disabled due to Storage limitations
  return [];
}

function switchAuthMode(mode) {
  const loginMode = mode === "login";
  elements.loginForm.classList.toggle("hidden", !loginMode);
  elements.registerForm.classList.toggle("hidden", loginMode);
  elements.showLoginBtn.classList.toggle("active", loginMode);
  elements.showRegisterBtn.classList.toggle("active", !loginMode);
  setAuthMessage("");
}

function setAuthMessage(message) {
  elements.authMessage.textContent = message;
}

function showAuth() {
  elements.authScreen.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  switchAuthMode("login");
}

function showApp() {
  elements.authScreen.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  renderAll();
}

function renderAll() {
  renderProfile();
  renderTimetable();
  renderClassNotes();
  renderTechNotes();
  renderDailyWork();
  renderStats();
}

function renderProfile() {
  const profile = state.profile || defaultState.profile;
  elements.loggedInAs.textContent = state.user
    ? `${state.user.name || "Student"} • ${state.user.email || ""}`
    : "";
  elements.studentName.value = profile.studentName || "";
  elements.collegeName.value = profile.collegeName || "";
  elements.branchName.value = profile.branchName || "";
  elements.semesterName.value = profile.semesterName || "2nd Semester";
  elements.sectionName.value = profile.sectionName || "";
  elements.goalName.value = profile.goalName || "";
}

function renderTimetable() {
  if (!state.timetable.length) {
    elements.timetableList.innerHTML = emptyState("No classes added yet.");
    return;
  }

  const orderedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const sorted = [...state.timetable].sort((a, b) => {
    const dayCompare = orderedDays.indexOf(a.day) - orderedDays.indexOf(b.day);
    return dayCompare !== 0 ? dayCompare : (a.startTime || "").localeCompare(b.startTime || "");
  });

  elements.timetableList.innerHTML = sorted
    .map(
      (entry) => `
        <article class="schedule-card">
          <strong>${escapeHtml(entry.subject)}</strong>
          <p class="entry-meta">${escapeHtml(entry.day)} • ${escapeHtml(formatScheduleTime(entry))}</p>
          <div class="schedule-meta">
            ${entry.room ? `<span class="pill">${escapeHtml(entry.room)}</span>` : ""}
          </div>
          ${deleteMarkup("timetable", entry.id)}
        </article>
      `,
    )
    .join("");

  bindDeleteButtons("timetable", "timetable");
}

function renderClassNotes() {
  if (!state.classNotes.length) {
    elements.classNotesList.innerHTML = emptyState("No class notes yet.");
    return;
  }

  elements.classNotesList.innerHTML = state.classNotes
    .map(
      (note) => `
        <article class="note-card">
          <strong>${escapeHtml(note.title)}</strong>
          <p class="entry-meta">${escapeHtml(note.subject)} • ${formatDate(note.date)}</p>
          <p>${escapeHtml(note.content)}</p>
          ${deleteMarkup("classNotes", note.id)}
        </article>
      `,
    )
    .join("");

  bindDeleteButtons("classNotes", "classNotes");
}

function renderTechNotes() {
  if (!state.techNotes.length) {
    elements.techNotesList.innerHTML = emptyState("No tech learning notes yet.");
    return;
  }

  elements.techNotesList.innerHTML = state.techNotes
    .map(
      (note) => `
        <article class="note-card">
          <strong>${escapeHtml(note.title)}</strong>
          <p class="entry-meta">${formatDate(note.date)}</p>
          <div class="tag-row">
            ${note.tag ? `<span class="pill">${escapeHtml(note.tag)}</span>` : ""}
          </div>
          <p>${escapeHtml(note.content)}</p>
          ${deleteMarkup("techNotes", note.id)}
        </article>
      `,
    )
    .join("");

  bindDeleteButtons("techNotes", "techNotes");
}

function renderDailyWork() {
  if (!state.dailyWork.length) {
    elements.dailyWorkList.innerHTML = emptyState("No daily work records yet.");
    return;
  }

  elements.dailyWorkList.innerHTML = state.dailyWork
    .map(
      (record) => `
        <article class="daily-card">
          <strong>${escapeHtml(record.title)}</strong>
          <p class="entry-meta">${formatDate(record.date)}${record.focus ? ` • ${escapeHtml(record.focus)}` : ""}</p>
          <p>${escapeHtml(record.summary)}</p>
          ${deleteMarkup("dailyWork", record.id)}
        </article>
      `,
    )
    .join("");

  bindDeleteButtons("dailyWork", "dailyWork");
}

function renderStats() {
  const uniqueSubjects = new Set(state.timetable.map((entry) => entry.subject.trim()).filter(Boolean));
  const totalFiles = state.dailyWork.reduce((count, record) => count + (record.files?.length || 0), 0);
  elements.subjectCount.textContent = String(uniqueSubjects.size);
  elements.noteCount.textContent = String(state.classNotes.length + state.techNotes.length);
  elements.fileCount.textContent = String(totalFiles);
}

function bindDeleteButtons(group, collectionName) {
  document.querySelectorAll(`[data-delete-group="${group}"]`).forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteId;
      if (collectionName === "dailyWork") {
        const record = state.dailyWork.find((item) => item.id === id);
        for (const file of record?.files || []) {
          await deleteObject(ref(storage, file.path));
        }
      }
      await deleteDoc(doc(db, "users", state.user.uid, collectionName, id));
    });
  });
}

function deleteMarkup(group, id) {
  return `
    <div class="entry-actions">
      <button class="ghost-btn" type="button" data-delete-group="${group}" data-delete-id="${id}">
        Delete
      </button>
    </div>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatScheduleTime(entry) {
  return `${formatClock(entry.startTime)} - ${formatClock(entry.endTime)}`;
}

function formatClock(value) {
  if (!value) return "No time";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readableError(error) {
  const code = error?.code || "";
  if (code.includes("auth/invalid-credential")) return "Invalid email or password.";
  if (code.includes("auth/email-already-in-use")) return "This email is already registered.";
  if (code.includes("auth/weak-password")) return "Choose a stronger password.";
  if (code.includes("auth/network-request-failed")) return "Network error. Check your internet connection.";
  return error?.message || "Something went wrong.";
}
