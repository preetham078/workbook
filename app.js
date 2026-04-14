const API_BASE = "/api";
const TOKEN_KEY = "campus-companion-auth-token";

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

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let state = structuredClone(defaultState);

const elements = {
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

  if (authToken) {
    try {
      await loadBootstrap();
      showApp();
      return;
    } catch {
      clearAuth();
    }
  }

  showAuth();
}

function bindAuthControls() {
  elements.showLoginBtn.addEventListener("click", () => switchAuthMode("login"));
  elements.showRegisterBtn.addEventListener("click", () => switchAuthMode("register"));

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Logging in...");

    try {
      const response = await apiRequest("/login", {
        method: "POST",
        body: {
          email: document.querySelector("#loginEmail").value.trim(),
          password: document.querySelector("#loginPassword").value,
        },
      });

      setAuth(response.token);
      await loadBootstrap();
      elements.loginForm.reset();
      setAuthMessage("");
      showApp();
    } catch (error) {
      setAuthMessage(error.message);
    }
  });

  elements.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Creating account...");

    try {
      const response = await apiRequest("/register", {
        method: "POST",
        body: {
          name: document.querySelector("#registerName").value.trim(),
          email: document.querySelector("#registerEmail").value.trim(),
          password: document.querySelector("#registerPassword").value,
        },
      });

      setAuth(response.token);
      await loadBootstrap();
      elements.registerForm.reset();
      setAuthMessage("");
      showApp();
    } catch (error) {
      setAuthMessage(error.message);
    }
  });
}

function bindAppControls() {
  elements.logoutBtn.addEventListener("click", async () => {
    try {
      await apiRequest("/logout", { method: "POST" });
    } catch {
      // Ignore logout network errors and still clear the local token.
    }
    clearAuth();
    showAuth();
  });

  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profile = {
      studentName: elements.studentName.value.trim(),
      collegeName: elements.collegeName.value.trim(),
      branchName: elements.branchName.value.trim(),
      semesterName: elements.semesterName.value.trim(),
      sectionName: elements.sectionName.value.trim(),
      goalName: elements.goalName.value.trim(),
    };

    await apiRequest("/profile", {
      method: "PUT",
      body: profile,
    });

    state.profile = profile;
    renderProfile();
    alert("Profile saved.");
  });

  elements.exportBtn.addEventListener("click", () => {
    const snapshot = JSON.stringify(state, null, 2);
    const blob = new Blob([snapshot], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "campus-companion-export.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  elements.timetableForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const created = await apiRequest("/timetable", {
      method: "POST",
      body: {
        day: elements.scheduleDay.value,
        startTime: elements.scheduleStartTime.value,
        endTime: elements.scheduleEndTime.value,
        subject: elements.scheduleSubject.value.trim(),
        room: elements.scheduleRoom.value.trim(),
      },
    });

    state.timetable.unshift(created.entry);
    elements.timetableForm.reset();
    renderAll();
  });

  elements.classNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const created = await apiRequest("/class-notes", {
      method: "POST",
      body: {
        title: document.querySelector("#classTitle").value.trim(),
        subject: document.querySelector("#classSubject").value.trim(),
        date: document.querySelector("#classDate").value,
        content: document.querySelector("#classContent").value.trim(),
      },
    });

    state.classNotes.unshift(created.entry);
    elements.classNoteForm.reset();
    renderAll();
  });

  elements.techNoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const created = await apiRequest("/tech-notes", {
      method: "POST",
      body: {
        title: document.querySelector("#techTitle").value.trim(),
        tag: document.querySelector("#techTag").value.trim(),
        date: document.querySelector("#techDate").value,
        content: document.querySelector("#techContent").value.trim(),
      },
    });

    state.techNotes.unshift(created.entry);
    elements.techNoteForm.reset();
    renderAll();
  });

  elements.dailyWorkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData();
    formData.append("date", document.querySelector("#workDate").value);
    formData.append("title", document.querySelector("#workTitle").value.trim());
    formData.append("focus", document.querySelector("#workFocus").value.trim());
    formData.append("summary", document.querySelector("#workSummary").value.trim());

    Array.from(elements.workFiles.files || []).forEach((file) => {
      formData.append("workFiles", file);
    });

    const created = await apiRequest("/daily-work", {
      method: "POST",
      formData,
    });

    state.dailyWork.unshift(created.entry);
    elements.dailyWorkForm.reset();
    renderAll();
  });
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

function setAuth(token) {
  authToken = token;
  localStorage.setItem(TOKEN_KEY, token);
}

function clearAuth() {
  authToken = "";
  localStorage.removeItem(TOKEN_KEY);
  state = structuredClone(defaultState);
}

async function loadBootstrap() {
  const data = await apiRequest("/bootstrap");
  state = {
    user: data.user,
    profile: {
      ...structuredClone(defaultState.profile),
      ...(data.profile || {}),
    },
    timetable: data.timetable || [],
    classNotes: data.classNotes || [],
    techNotes: data.techNotes || [],
    dailyWork: data.dailyWork || [],
  };
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
    ? `${state.user.name} • ${state.user.email}`
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

  bindDeleteButtons("timetable", "/timetable");
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

  bindDeleteButtons("classNotes", "/class-notes");
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

  bindDeleteButtons("techNotes", "/tech-notes");
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
          <div class="file-list">
            ${(record.files || [])
              .map(
                (file) => `
                  <button type="button" class="file-pill" data-file-id="${file.id}">
                    ${escapeHtml(file.originalName)}
                  </button>
                `,
              )
              .join("")}
          </div>
          ${deleteMarkup("dailyWork", record.id)}
        </article>
      `,
    )
    .join("");

  bindDeleteButtons("dailyWork", "/daily-work");
  bindDownloadButtons();
}

function renderStats() {
  const uniqueSubjects = new Set(state.timetable.map((entry) => entry.subject.trim()).filter(Boolean));
  const totalFiles = state.dailyWork.reduce((count, record) => count + (record.files?.length || 0), 0);

  elements.subjectCount.textContent = String(uniqueSubjects.size);
  elements.noteCount.textContent = String(state.classNotes.length + state.techNotes.length);
  elements.fileCount.textContent = String(totalFiles);
}

function bindDeleteButtons(group, endpoint) {
  document.querySelectorAll(`[data-delete-group="${group}"]`).forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteId;
      await apiRequest(`${endpoint}/${id}`, { method: "DELETE" });
      state[group] = state[group].filter((item) => String(item.id) !== String(id));
      renderAll();
    });
  });
}

function bindDownloadButtons() {
  document.querySelectorAll("[data-file-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE}/files/${button.dataset.fileId}/download`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        alert("Could not download this file.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+)"/);
      const fileName = match ? match[1] : "download";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
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
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
}

async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {},
  };

  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }

  if (options.formData) {
    config.body = options.formData;
  } else if (options.body) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      showAuth();
    }
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}
