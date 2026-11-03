#!/data/data/com.termux/files/usr/bin/bash

set +e
cd "$HOME/ATLAS-CLIMATE-AI" || exit 1

echo "======================================"
echo "       ATLAS CLIMATE AI REPAIR"
echo "======================================"

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$HOME/ATLAS-CLIMATE-AI-BACKUP-$STAMP"

mkdir -p "$BACKUP"
cp -a server.js package.json capacitor.config.json www "$BACKUP/" 2>/dev/null

echo "[1/7] Backup: $BACKUP"

echo
echo "[2/7] Checking project files..."

for f in package.json server.js capacitor.config.json www/index.html; do
  if [ -f "$f" ]; then
    echo "OK: $f"
  else
    echo "MISSING: $f"
  fi
done

echo
echo "[3/7] Checking package.json..."

node -e '
try {
 const p=require("./package.json");
 console.log("Name:",p.name);
 console.log("Start:",p.scripts?.start || "not defined");
 console.log("Dependencies:",Object.keys(p.dependencies||{}).length);
} catch(e) {
 console.log("PACKAGE ERROR:",e.message);
 process.exitCode=1;
}'

echo
echo "[4/7] Checking server JavaScript..."

if [ -f server.js ]; then
  node --check server.js
  echo "Server syntax check completed."
fi

echo
echo "[5/7] Checking frontend JavaScript..."

if [ -f www/index.html ]; then
  mkdir -p "$BACKUP/frontend-check"

  python - <<'PY'
import re, pathlib, subprocess, os

html = pathlib.Path("www/index.html").read_text(errors="replace")
scripts = re.findall(
    r"<script\b([^>]*)>(.*?)</script\s*>",
    html, re.I | re.S
)

count = 0
for attrs, code in scripts:
    if not code.strip():
        continue
    if re.search(r'\bsrc\s*=', attrs, re.I):
        continue

    count += 1
    ext = ".mjs" if re.search(r'\btype\s*=\s*["\']module', attrs, re.I) else ".js"
    path = pathlib.Path(os.environ["HOME"]) / "ATLAS-CLIMATE-AI-BACKUP-CHECK" / f"script-{count}{ext}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(code)

    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"OK: inline script {count}")
    else:
        print(f"JS ERROR: inline script {count}")
        print(result.stderr[:1500])

if count == 0:
    print("No inline JavaScript found.")
PY
fi

echo
echo "[6/7] Checking environment configuration..."

if [ -f .env ]; then
  echo "Found .env file."
else
  echo "No .env file. AI endpoint may require an API key."
fi

echo
echo "[7/7] Testing server..."

if [ -f server.js ] && [ -d node_modules ]; then
  PORT=3187 node server.js > "$BACKUP/server-test.log" 2>&1 &
  PID=$!
  sleep 3

  if curl -fsS http://127.0.0.1:3187/api/health; then
    echo
    echo "HEALTH CHECK: SUCCESS"
  else
    echo
    echo "HEALTH CHECK: FAILED"
    echo "Server log:"
    cat "$BACKUP/server-test.log"
  fi

  kill "$PID" 2>/dev/null
else
  echo "Cannot test server: server.js or node_modules missing."
fi

echo
echo "======================================"
echo "             REPORT"
echo "======================================"
echo "Backup saved at:"
echo "$BACKUP"
echo
echo "No existing lessons or project files were deleted."
echo "Check the errors above before applying further changes."
