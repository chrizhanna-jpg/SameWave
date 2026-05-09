@echo off
setlocal
cd /d "%~dp0"

pnpm install --frozen-lockfile || exit /b 1
pnpm --filter @workspace/api-server run build || exit /b 1

echo API server bundle ready: artifacts\api-server\dist\index.mjs
