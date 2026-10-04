// Vercel: exit 0 skips a build; exit 1 runs it. Unknown history always builds.
const { execFileSync } = require("node:child_process");
function documentationOnly(files) {
  return files.length > 0 && files.every((file) =>
    file.startsWith("docs/") || file.startsWith("tests/") ||
    file === "README.md" || file === "AGENTS.md"
  );
}
function shouldSkip() {
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (process.env.VERCEL_FORCE_BUILD === "true" || !/^[a-f0-9]{40}$/i.test(previous || "")) return false;
  try {
    const files = execFileSync("git", ["diff", "--name-only", "-z", previous, "HEAD", "--"], { encoding: "utf8" })
      .split("\0").filter(Boolean);
    return documentationOnly(files);
  } catch { return false; }
}
if (require.main === module) {
  const skip = shouldSkip();
  console.log(skip ? "Skipping documentation/test-only deployment." : "Building application (or unknown history).");
  process.exit(skip ? 0 : 1);
}
module.exports = { documentationOnly, shouldSkip };
