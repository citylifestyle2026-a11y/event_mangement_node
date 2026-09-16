// scripts/diagnoseUploads.js
//
// ONE-TIME, READ-ONLY DIAGNOSTIC. Does not touch app logic, DB, QR,
// PDF, or validation. Run it directly on the LIVE Plesk server with
// the SAME user/environment Node normally runs as, from the backend
// app root:
//
//   cd /path/to/your/backend   (wherever server.js actually lives on Plesk)
//   node scripts/diagnoseUploads.js
//
// It writes ONE small test file into each of the three folders you
// care about, verifies it's actually readable back, then deletes it.
// Copy/paste the full output back — it will pinpoint exactly which of
// the 9 items is the cause.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const line = () => console.log("-".repeat(60));

console.log("================ UPLOADS DIAGNOSTIC ================");

// 1 & 2. cwd vs __dirname
line();
console.log("process.cwd()      :", process.cwd());
console.log("__dirname (script) :", __dirname);
const appRoot = path.join(__dirname, ".."); // scripts/ -> backend root
console.log("Resolved app root  :", path.resolve(appRoot));

// 3. Confirm this matches config/uploadPaths.js's own computation
line();
let UPLOAD_ROOT;
try {
  ({ UPLOAD_ROOT } = require(path.join(appRoot, "config", "uploadPaths")));
  console.log("config/uploadPaths.js UPLOAD_ROOT:", UPLOAD_ROOT);
} catch (e) {
  console.log("FAILED to load config/uploadPaths.js:", e.message);
}

// app.js's express.static root (same computation, without booting the server)
const staticRoot = path.join(appRoot, "uploads");
console.log("app.js static-serve root (expected):", staticRoot);
console.log("MATCH:", UPLOAD_ROOT === staticRoot);

// 4. Process user
line();
try {
  console.log("Node process uid/gid:", process.getuid(), "/", process.getgid());
  console.log("OS user info:", JSON.stringify(os.userInfo()));
} catch (e) {
  console.log("Could not read process uid/gid (non-POSIX?):", e.message);
}
try {
  console.log("whoami:", execSync("whoami").toString().trim());
} catch (e) {
  console.log("whoami failed:", e.message);
}

// 5 & 6. Permissions on uploads/ and each subfolder
line();
const subfolders = ["events", "qr-codes", "ticket-pdfs"];
const targetDirs = [UPLOAD_ROOT || staticRoot, ...subfolders.map((s) => path.join(UPLOAD_ROOT || staticRoot, s))];

targetDirs.forEach((dir) => {
  const exists = fs.existsSync(dir);
  let stat = null;
  let writable = false;
  try {
    stat = exists ? fs.statSync(dir) : null;
    fs.accessSync(dir, fs.constants.W_OK);
    writable = true;
  } catch (e) {
    writable = false;
  }
  console.log(
    `${dir}\n   exists=${exists} writable=${writable}` +
      (stat ? ` mode=${(stat.mode & 0o777).toString(8)} uid=${stat.uid} gid=${stat.gid}` : "")
  );
});

// 7. Disk space
line();
try {
  console.log(execSync(`df -h "${UPLOAD_ROOT || staticRoot}"`).toString());
} catch (e) {
  console.log("df failed:", e.message);
}

// 8. ACTUAL write test — the real proof
line();
console.log("Attempting real write test into each folder...");
subfolders.forEach((sub) => {
  const dir = path.join(UPLOAD_ROOT || staticRoot, sub);
  const testFile = path.join(dir, `__diag_test_${Date.now()}.txt`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(testFile, "diagnostic write test");
    const readBack = fs.existsSync(testFile) && fs.readFileSync(testFile, "utf8");
    console.log(`  ${sub}: WRITE OK, read-back=${readBack ? "OK" : "FAILED"} -> ${testFile}`);
    fs.unlinkSync(testFile);
  } catch (e) {
    console.log(`  ${sub}: WRITE FAILED -> ${e.code || e.message}`);
  }
});

// 9. Deployed code version check — confirms the fix from earlier is actually live
line();
try {
  const localUploadSrc = fs.readFileSync(
    path.join(appRoot, "utils", "localUpload.util.js"),
    "utf8"
  );
  const pdfServiceSrc = fs.readFileSync(
    path.join(appRoot, "services", "pdf.service.js"),
    "utf8"
  );
  console.log(
    "localUpload.util.js has post-write existsSync verification:",
    localUploadSrc.includes("file was not found on disk after write")
  );
  console.log(
    "pdf.service.js reads local uploads from disk (not HTTP self-fetch):",
    pdfServiceSrc.includes("resolveLocalUploadPath")
  );
} catch (e) {
  console.log("Could not read source files for version check:", e.message);
}

line();
console.log("================ END DIAGNOSTIC ================");