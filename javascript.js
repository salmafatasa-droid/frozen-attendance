
/* =====================================================
   FROZEN ATTENDANCE
   Main JavaScript
   Frontend: GitHub Pages
   Backend: Google Apps Script Web App
===================================================== */

"use strict";

/* =====================================================
   KONFIGURASI APLIKASI
===================================================== */

const CONFIG = {
  // URL ini akan diisi setelah Google Apps Script di-deploy.
  API_URL: "",

  // Nama file scanner yang akan dibuat berikutnya.
  SCANNER_URL: "scanner.html",

  // Zona waktu aplikasi.
  TIMEZONE: "Asia/Jakarta",

  // Nama sekolah.
  SCHOOL_NAME: "SMAN 2 PAYAKUMBUH"
};

const APP = {
  user: null,
  token: "",
  currentPage: "dashboard",
  students: [],
  teachers: [],
  classes: [],
  attendance: [],
  schedules: [],
  report: [],
  modalType: "",
  modalId: "",
  loading: false
};

/* =====================================================
   HELPER
===================================================== */

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: CONFIG.TIMEZONE
  }).format(date);
}

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CONFIG.TIMEZONE
  }).format(date);
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function showToast(message, duration = 3000) {
  const toast = $("toast");
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function setButtonLoading(button, loading, label = "Memproses...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function getValue(id) {
  return $(id)?.value?.trim() || "";
}

function getRecordId(record) {
  return record.id || record.ID || record.idSiswa ||
    record.idGuru || record.idKelas || record.idJadwal ||
    record.idAbsensi || "";
}

function getField(record, ...names) {
  for (const name of names) {
    if (record && record[name] !== undefined && record[name] !== null) {
      return record[name];
    }
  }
  return "";
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

/* =====================================================
   KONEKSI API GOOGLE APPS SCRIPT
===================================================== */

async function apiRequest(action, data = {}) {
  if (!CONFIG.API_URL) {
    throw new Error(
      "URL Google Apps Script belum diatur. Kita akan mengisinya setelah proses Deploy."
    );
  }

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      data: {
        ...data,
        user: APP.user?.username || ""
      }
    })
  });

  if (!response.ok) {
    throw new Error("Gagal menghubungi server. Periksa koneksi internet.");
  }

  const result = await response.json();

  if (!result || result.ok !== true) {
    throw new Error(result?.message || "Permintaan tidak berhasil.");
  }

  return result;
}

/* =====================================================
   LOGIN
===================================================== */

async function handleLogin(event) {
  event.preventDefault();

  const username = getValue("username");
  const password = getValue("password");
  const button = $("loginButton");
  const message = $("loginMessage");

  if (!username || !password) {
    if (message) message.textContent = "Username dan password wajib diisi.";
    return;
  }

  if (message) message.textContent = "";

  setButtonLoading(button, true, "Memeriksa...");

  try {
    const result = await apiRequest("login", {
      username,
      password
    });

    APP.user = result.data?.user || result.data || {
      username,
      role: "ADMIN"
    };

    APP.token = result.data?.token || "";

    showApplication();
    await loadAllData();

    showToast("Login berhasil. Selamat datang!");
  } catch (error) {
    if (message) message.textContent = error.message;
    else showToast(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

function showApplication() {
  $("loginPage")?.classList.add("hidden");
  $("loginPage")?.classList.remove("active");

  $("appPage")?.classList.remove("hidden");
  $("appPage")?.classList.add("active");

  if ($("profileName")) {
    $("profileName").textContent =
      APP.user?.name || APP.user?.username || "Pengguna";
  }

  if ($("profileRole")) {
    $("profileRole").textContent = APP.user?.role || "USER";
  }

  showPage("dashboard");
}

function logout() {
  APP.user = null;
  APP.token = "";

  $("appPage")?.classList.add("hidden");
  $("appPage")?.classList.remove("active");

  $("loginPage")?.classList.remove("hidden");
  $("loginPage")?.classList.add("active");

  if ($("loginForm")) $("loginForm").reset();
  if ($("loginMessage")) $("loginMessage").textContent = "";

  showToast("Kamu telah keluar dari aplikasi.");
}

/* =====================================================
   NAVIGASI HALAMAN
===================================================== */

function showPage(pageName) {
  APP.currentPage = pageName;

  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const target = $("page-" + pageName);
  if (target) target.classList.add("active");

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  const titles = {
    dashboard: "Dashboard",
    scan: "Scan QR",
    students: "Data Siswa",
    teachers: "Data Guru",
    classes: "Data Kelas",
    attendance: "Data Absensi",
    schedules: "Jadwal",
    reports: "Laporan"
  };

  const pageTitle = $("pageTitle");
  if (pageTitle) pageTitle.textContent = titles[pageName] || "Frozen Attendance";
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if (page) showPage(page);
    });
  });
}

/* =====================================================
   MEMUAT SELURUH DATA
===================================================== */

async function loadAllData() {
  await Promise.allSettled([
    loadDashboard(),
    loadStudents(),
    loadTeachers(),
    loadClasses(),
    loadAttendance(),
    loadSchedules()
  ]);
}

/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {
  try {
    const result = await apiRequest("dashboard");
    const data = result.data || {};

    setText("totalStudents", data.totalStudents ?? data.totalSiswa ?? 0);
    setText("totalTeachers", data.totalTeachers ?? data.totalGuru ?? 0);
    setText("totalClasses", data.totalClasses ?? data.totalKelas ?? 0);
    setText("totalAttendance", data.totalAttendance ?? data.totalAbsensi ?? 0);

    setText("countHadir", data.hadir ?? data.countHadir ?? 0);
    setText("countIzin", data.izin ?? data.countIzin ?? 0);
    setText("countSakit", data.sakit ?? data.countSakit ?? 0);
    setText("countAlfa", data.alfa ?? data.countAlfa ?? 0);
  } catch (error) {
    console.error("Dashboard:", error);
  }

  updateClock();
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function updateClock() {
  const now = new Date();

  setText("currentDate", formatDate(now));
  setText("currentClock", new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: CONFIG.TIMEZONE
  }).format(now));
}

/* =====================================================
   DATA SISWA
===================================================== */

async function loadStudents() {
  try {
    const result = await apiRequest("students");
    APP.students = normalizeArray(result.data);
    renderStudents();
  } catch (error) {
    console.error("Data siswa:", error);
  }
}

function renderStudents(keyword = "") {
  const container = $("studentList");
  if (!container) return;

  const search = keyword.toLowerCase();

  const records = APP.students.filter(student => {
    const text = [
      getField(student, "nama", "Nama", "name"),
      getField(student, "nis", "NIS"),
      getField(student, "kelas", "namaKelas", "Nama Kelas")
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  if (!records.length) {
    container.innerHTML = `<tr><td colspan="8" class="empty-state">Belum ada data siswa.</td></tr>`;
    return;
  }

  container.innerHTML = records.map(student => `
    <tr>
      <td>${escapeHTML(getField(student, "nis", "NIS", "id"))}</td>
      <td>${escapeHTML(getField(student, "nama", "Nama", "name"))}</td>
      <td>${escapeHTML(getField(student, "kelas", "namaKelas", "Nama Kelas"))}</td>
      <td>${escapeHTML(getField(student, "jenisKelamin", "jk", "Jenis Kelamin") || "-")}</td>
      <td>${escapeHTML(getField(student, "qrToken", "QR Token") || "-")}</td>
      <td>
        <button class="btn-secondary btn-small" data-edit="student" data-id="${escapeHTML(getRecordId(student))}">Edit</button>
        <button class="btn-danger btn-small" data-delete="student" data-id="${escapeHTML(getRecordId(student))}">Hapus</button>
      </td>
    </tr>
  `).join("");
}

/* =====================================================
   DATA GURU
===================================================== */

async function loadTeachers() {
  try {
    const result = await apiRequest("teachers");
    APP.teachers = normalizeArray(result.data);
    renderTeachers();
  } catch (error) {
    console.error("Data guru:", error);
  }
}

function renderTeachers(keyword = "") {
  const container = $("teacherList");
  if (!container) return;

  const search = keyword.toLowerCase();

  const records = APP.teachers.filter(teacher => {
    const text = [
      getField(teacher, "nama", "Nama", "name"),
      getField(teacher, "nip", "NIP"),
      getField(teacher, "jabatan", "Jabatan")
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  if (!records.length) {
    container.innerHTML = `<tr><td colspan="7" class="empty-state">Belum ada data guru.</td></tr>`;
    return;
  }

  container.innerHTML = records.map(teacher => `
    <tr>
      <td>${escapeHTML(getField(teacher, "nip", "NIP", "id"))}</td>
      <td>${escapeHTML(getField(teacher, "nama", "Nama", "name"))}</td>
      <td>${escapeHTML(getField(teacher, "jabatan", "Jabatan") || "-")}</td>
      <td>${escapeHTML(getField(teacher, "qrToken", "QR Token") || "-")}</td>
      <td>
        <button class="btn-secondary btn-small" data-edit="teacher" data-id="${escapeHTML(getRecordId(teacher))}">Edit</button>
        <button class="btn-danger btn-small" data-delete="teacher" data-id="${escapeHTML(getRecordId(teacher))}">Hapus</button>
      </td>
    </tr>
  `).join("");
}

/* =====================================================
   DATA KELAS
===================================================== */

async function loadClasses() {
  try {
    const result = await apiRequest("classes");
    APP.classes = normalizeArray(result.data);
    renderClasses();
  } catch (error) {
    console.error("Data kelas:", error);
  }
}

function renderClasses(keyword = "") {
  const container = $("classList");
  if (!container) return;

  const search = keyword.toLowerCase();

  const records = APP.classes.filter(item => {
    const text = [
      getField(item, "namaKelas", "kelas", "Nama Kelas", "nama"),
      getField(item, "waliKelas", "Wali Kelas")
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  if (!records.length) {
    container.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada data kelas.</td></tr>`;
    return;
  }

  container.innerHTML = records.map(item => `
    <tr>
      <td>${escapeHTML(getField(item, "idKelas", "ID Kelas", "id"))}</td>
      <td>${escapeHTML(getField(item, "namaKelas", "kelas", "Nama Kelas", "nama"))}</td>
      <td>${escapeHTML(getField(item, "waliKelas", "Wali Kelas") || "-")}</td>
      <td>
        <button class="btn-secondary btn-small" data-edit="class" data-id="${escapeHTML(getRecordId(item))}">Edit</button>
        <button class="btn-danger btn-small" data-delete="class" data-id="${escapeHTML(getRecordId(item))}">Hapus</button>
      </td>
    </tr>
  `).join("");
}

/* =====================================================
   DATA ABSENSI
===================================================== */

async function loadAttendance() {
  try {
    const result = await apiRequest("attendance");
    APP.attendance = normalizeArray(result.data);
    renderAttendance();
  } catch (error) {
    console.error("Data absensi:", error);
  }
}

function renderAttendance(keyword = "") {
  const container = $("attendanceList");
  if (!container) return;

  const search = keyword.toLowerCase();

  const records = APP.attendance.filter(item => {
    const text = [
      getField(item, "nama", "namaSiswa", "Nama"),
      getField(item, "nis", "NIS"),
      getField(item, "kelas", "namaKelas"),
      getField(item, "status", "Status")
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  if (!records.length) {
    container.innerHTML = `<tr><td colspan="8" class="empty-state">Belum ada catatan absensi.</td></tr>`;
    return;
  }

  container.innerHTML = records.map(item => {
    const status = String(getField(item, "status", "Status") || "").toUpperCase();

    return `
      <tr>
        <td>${escapeHTML(formatDate(getField(item, "tanggal", "date", "timestamp")))}</td>
        <td>${escapeHTML(formatTime(getField(item, "waktu", "time", "timestamp")))}</td>
        <td>${escapeHTML(getField(item, "nama", "namaSiswa", "Nama"))}</td>
        <td>${escapeHTML(getField(item, "nis", "NIS"))}</td>
        <td>${escapeHTML(getField(item, "kelas", "namaKelas"))}</td>
        <td><span class="status-badge status-${status.toLowerCase()}">${escapeHTML(status)}</span></td>
        <td>${escapeHTML(getField(item, "keterangan", "catatan", "note") || "-")}</td>
        <td>
          <button class="btn-danger btn-small" data-delete="attendance" data-id="${escapeHTML(getRecordId(item))}">Hapus</button>
        </td>
      </tr>
    `;
  }).join("");
}

/* =====================================================
   JADWAL
===================================================== */

async function loadSchedules() {
  try {
    const result = await apiRequest("schedules");
    APP.schedules = normalizeArray(result.data);
    renderSchedules();
  } catch (error) {
    console.error("Jadwal:", error);
  }
}

function renderSchedules() {
  const container = $("scheduleList");
  if (!container) return;

  if (!APP.schedules.length) {
    container.innerHTML = `<tr><td colspan="7" class="empty-state">Belum ada jadwal.</td></tr>`;
    return;
  }

  container.innerHTML = APP.schedules.map(item => `
    <tr>
      <td>${escapeHTML(getField(item, "hari", "Hari"))}</td>
      <td>${escapeHTML(getField(item, "namaKelas", "kelas", "Kelas"))}</td>
      <td>${escapeHTML(getField(item, "mataPelajaran", "mapel", "Mata Pelajaran"))}</td>
      <td>${escapeHTML(getField(item, "namaGuru", "guru", "Guru"))}</td>
      <td>${escapeHTML(getField(item, "jamMasuk", "Jam Masuk"))}</td>
      <td>${escapeHTML(getField(item, "jamPulang", "Jam Pulang"))}</td>
      <td>
        <button class="btn-secondary btn-small" data-edit="schedule" data-id="${escapeHTML(getRecordId(item))}">Edit</button>
        <button class="btn-danger btn-small" data-delete="schedule" data-id="${escapeHTML(getRecordId(item))}">Hapus</button>
      </td>
    </tr>
  `).join("");
}

/* =====================================================
   MODAL DAN FORM DINAMIS
===================================================== */

const FORM_FIELDS = {
  student: [
    ["nis", "NIS", "text", true],
    ["nama", "Nama Siswa", "text", true],
    ["kelas", "Kelas", "select", true],
    ["jenisKelamin", "Jenis Kelamin", "select", true]
  ],
  teacher: [
    ["nip", "NIP", "text", false],
    ["nama", "Nama Guru", "text", true],
    ["jabatan", "Jabatan", "text", false]
  ],
  class: [
    ["namaKelas", "Nama Kelas", "text", true],
    ["waliKelas", "Wali Kelas", "text", false]
  ],
  schedule: [
    ["hari", "Hari", "select", true],
    ["kelas", "Kelas", "select", true],
    ["mataPelajaran", "Mata Pelajaran", "text", true],
    ["guru", "Guru", "select", true],
    ["jamMasuk", "Jam Masuk", "time", true],
    ["jamPulang", "Jam Pulang", "time", true]
  ],
  manualAttendance: [
    ["nis", "NIS Siswa", "text", true],
    ["status", "Status", "select", true],
    ["keterangan", "Keterangan", "textarea", false]
  ]
};

function openModal(type, id = "") {
  const modal = $("formModal");
  const form = $("dynamicForm");
  const fieldsContainer = $("modalFields");

  if (!modal || !form || !fieldsContainer) {
    showToast("Form modal tidak ditemukan di index.html.");
    return;
  }

  APP.modalType = type;
  APP.modalId = id;

  const titles = {
    student: id ? "Edit Data Siswa" : "Tambah Siswa",
    teacher: id ? "Edit Data Guru" : "Tambah Guru",
    class: id ? "Edit Data Kelas" : "Tambah Kelas",
    schedule: id ? "Edit Jadwal" : "Tambah Jadwal",
    manualAttendance: "Input Absensi Manual"
  };

  setText("modalTitle", titles[type] || "Form Data");

  const source = {
    student: APP.students,
    teacher: APP.teachers,
    class: APP.classes,
    schedule: APP.schedules
  }[type] || [];

  const record = source.find(item => String(getRecordId(item)) === String(id)) || {};

  const fields = FORM_FIELDS[type] || [];

  fieldsContainer.innerHTML = fields.map(([name, label, kind, required]) => {
    const value = getField(record, name, name[0].toUpperCase() + name.slice(1));

    if (kind === "select") {
      let options = [];

      if (name === "kelas") {
        options = APP.classes.map(item => ({
          value: getField(item, "namaKelas", "kelas", "nama"),
          label: getField(item, "namaKelas", "kelas", "nama")
        }));
      } else if (name === "guru") {
        options = APP.teachers.map(item => ({
          value: getField(item, "nama", "Nama"),
          label: getField(item, "nama", "Nama")
        }));
      } else if (name === "jenisKelamin") {
        options = [
          { value: "L", label: "Laki-laki" },
          { value: "P", label: "Perempuan" }
        ];
      } else if (name === "status") {
        options = ["HADIR", "IZIN", "SAKIT", "ALFA"].map(x => ({
          value: x,
          label: x
        }));
      } else if (name === "hari") {
        options = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map(x => ({
          value: x,
          label: x
        }));
      }

      return `
        <div class="form-group">
          <label for="field-${name}">${label}${required ? " *" : ""}</label>
          <select id="field-${name}" name="${name}" ${required ? "required" : ""}>
            <option value="">Pilih ${label}</option>
            ${options.map(option => `
              <option value="${escapeHTML(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>
                ${escapeHTML(option.label)}
              </option>
            `).join("")}
          </select>
        </div>
      `;
    }

    if (kind === "textarea") {
      return `
        <div class="form-group">
          <label for="field-${name}">${label}</label>
          <textarea id="field-${name}" name="${name}">${escapeHTML(value)}</textarea>
        </div>
      `;
    }

    return `
      <div class="form-group">
        <label for="field-${name}">${label}${required ? " *" : ""}</label>
        <input id="field-${name}" name="${name}" type="${kind}"
          value="${escapeHTML(value)}" ${required ? "required" : ""}>
      </div>
    `;
  }).join("");

  modal.classList.add("show");
  modal.classList.remove("hidden");
}

function closeModal() {
  $("formModal")?.classList.remove("show");
  $("formModal")?.classList.add("hidden");
  $("dynamicForm")?.reset();

  APP.modalType = "";
  APP.modalId = "";
}

async function saveModal(event) {
  event.preventDefault();

  const form = $("dynamicForm");
  if (!form || !form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());

  const actionMap = {
    student: "saveStudent",
    teacher: "saveTeacher",
    class: "saveClass",
    schedule: "saveSchedule",
    manualAttendance: "manualAttendance"
  };

  const action = actionMap[APP.modalType];
  if (!action) return;

  if (APP.modalId) data.id = APP.modalId;

  const button = $("saveModalButton");
  setButtonLoading(button, true, "Menyimpan...");

  try {
    await apiRequest(action, data);
    closeModal();
    showToast("Data berhasil disimpan.");
    await refreshCurrentData();
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

/* =====================================================
   HAPUS DATA
===================================================== */

async function deleteRecord(type, id) {
  if (!id) {
    showToast("ID data tidak ditemukan.");
    return;
  }

  const confirmed = confirm("Apakah kamu yakin ingin menghapus data ini?");
  if (!confirmed) return;

  const actions = {
    student: "deleteStudent",
    teacher: "deleteTeacher",
    class: "deleteClass",
    schedule: "deleteSchedule",
    attendance: "deleteAttendance"
  };

  try {
    await apiRequest(actions[type], { id });
    showToast("Data berhasil dihapus.");
    await refreshCurrentData();
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshCurrentData() {
  await loadAllData();
}

/* =====================================================
   SCANNER QR
===================================================== */

function openScanner() {
  const url = new URL(CONFIG.SCANNER_URL, window.location.href);
  url.searchParams.set("source", "frozen-attendance");

  window.open(url.href, "FrozenAttendanceScanner", "width=650,height=750");
}

async function handleScannedQR(qrValue) {
  if (!qrValue) return;

  const resultBox = $("scanResult");
  if (resultBox) resultBox.textContent = "Memproses QR Code...";

  try {
    const result = await apiRequest("scan", {
      qr: qrValue,
      userId: APP.user?.username || "",
      role: APP.user?.role || ""
    });

    if (resultBox) {
      resultBox.textContent = result.message || "Absensi berhasil diproses.";
    }

    showToast(result.message || "Absensi berhasil.");
    await Promise.all([loadAttendance(), loadDashboard()]);
  } catch (error) {
    if (resultBox) resultBox.textContent = error.message;
    showToast(error.message);
  }
}

window.addEventListener("message", event => {
  // Scanner harus berasal dari halaman GitHub Pages yang sama.
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === "FROZEN_QR_RESULT") {
    handleScannedQR(event.data.qr);
  }
});

/* =====================================================
   FILTER PENCARIAN
===================================================== */

function setupSearch() {
  $("studentSearch")?.addEventListener("input", event => {
    renderStudents(event.target.value);
  });

  $("teacherSearch")?.addEventListener("input", event => {
    renderTeachers(event.target.value);
  });

  $("classSearch")?.addEventListener("input", event => {
    renderClasses(event.target.value);
  });
}

/* =====================================================
   FILTER ABSENSI
===================================================== */

async function filterAttendance() {
  const date = getValue("attendanceDate");
  const status = getValue("attendanceStatus");

  try {
    const result = await apiRequest("attendance", { date, status });
    APP.attendance = normalizeArray(result.data);
    renderAttendance();
  } catch (error) {
    showToast(error.message);
  }
}

/* =====================================================
   LAPORAN
===================================================== */

async function generateReport() {
  const startDate = getValue("reportStart");
  const endDate = getValue("reportEnd");

  if (!startDate || !endDate) {
    showToast("Pilih tanggal awal dan tanggal akhir.");
    return;
  }

  if (startDate > endDate) {
    showToast("Tanggal awal tidak boleh melebihi tanggal akhir.");
    return;
  }

  const button = $("generateReportButton");
  setButtonLoading(button, true, "Membuat laporan...");

  try {
    const result = await apiRequest("report", {
      startDate,
      endDate
    });

    APP.report = normalizeArray(result.data);
    renderReport();

    showToast("Laporan berhasil dibuat.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setButtonLoading(button, false);
  }
}

function renderReport() {
  const container = $("reportList");
  if (!container) return;

  const summary = $("reportSummary");

  if (summary) {
    summary.textContent = `Total data laporan: ${APP.report.length}`;
  }

  if (!APP.report.length) {
    container.innerHTML = `<tr><td colspan="7" class="empty-state">Tidak ada data laporan pada periode tersebut.</td></tr>`;
    return;
  }

  container.innerHTML = APP.report.map(item => `
    <tr>
      <td>${escapeHTML(formatDate(getField(item, "tanggal", "date", "timestamp")))}</td>
      <td>${escapeHTML(getField(item, "nis", "NIS"))}</td>
      <td>${escapeHTML(getField(item, "nama", "namaSiswa", "Nama"))}</td>
      <td>${escapeHTML(getField(item, "kelas", "namaKelas"))}</td>
      <td>${escapeHTML(getField(item, "status", "Status"))}</td>
      <td>${escapeHTML(getField(item, "keterangan", "catatan", "note") || "-")}</td>
    </tr>
  `).join("");
}

/* =====================================================
   EVENT LISTENERS
===================================================== */

function setupEvents() {
  $("loginForm")?.addEventListener("submit", handleLogin);
  $("logoutButton")?.addEventListener("click", logout);

  $("openScannerButton")?.addEventListener("click", openScanner);

  $("closeModalButton")?.addEventListener("click", closeModal);
  $("cancelModalButton")?.addEventListener("click", closeModal);
  $("saveModalButton")?.addEventListener("click", saveModal);
  $("dynamicForm")?.addEventListener("submit", saveModal);

  $("filterAttendanceButton")?.addEventListener("click", filterAttendance);
  $("manualAttendanceButton")?.addEventListener("click", () => openModal("manualAttendance"));

  $("addScheduleButton")?.addEventListener("click", () => openModal("schedule"));
  $("generateReportButton")?.addEventListener("click", generateReport);

  setupNavigation();
  setupSearch();

  $("formModal")?.addEventListener("click", event => {
    if (event.target === $("formModal")) closeModal();
  });

  document.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      openModal(editButton.dataset.edit, editButton.dataset.id);
    }

    if (deleteButton) {
      deleteRecord(deleteButton.dataset.delete, deleteButton.dataset.id);
    }
  });

  // Tombol tambah data jika tersedia di index.html.
  document.querySelectorAll("[data-add]").forEach(button => {
    button.addEventListener("click", () => {
      openModal(button.dataset.add);
    });
  });
}

/* =====================================================
   INISIALISASI
===================================================== */

function initializeApp() {
  setupEvents();

  if ($("attendanceDate")) {
    $("attendanceDate").value = todayKey();
  }

  if ($("reportStart")) {
    $("reportStart").value = todayKey();
  }

  if ($("reportEnd")) {
    $("reportEnd").value = todayKey();
  }

  updateClock();
  setInterval(updateClock, 1000);

  $("loginPage")?.classList.remove("hidden");
  $("loginPage")?.classList.add("active");

  $("appPage")?.classList.add("hidden");
  $("appPage")?.classList.remove("active");
}

document.addEventListener("DOMContentLoaded", initializeApp);
