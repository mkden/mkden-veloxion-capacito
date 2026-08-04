const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const androidRoot = path.join(projectRoot, "android");
const gradleUserHome = path.join(projectRoot, ".gradle-user");
const gradleCommand = process.platform === "win32"
  ? path.join(androidRoot, "gradlew.bat")
  : path.join(androidRoot, "gradlew");
const args = process.argv.slice(2);

if (!args.length) {
  args.push("assembleRelease", "--no-daemon", "--console=plain");
}

const result = spawnSync(gradleCommand, args, {
  cwd: androidRoot,
  env: {
    ...process.env,
    GRADLE_USER_HOME: gradleUserHome,
    NODE_ENV: process.env.NODE_ENV || "production",
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
