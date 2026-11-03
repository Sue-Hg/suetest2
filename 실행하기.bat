@echo off
chcp 65001 > nul
echo ==========================================================
echo [대기오염 실시간 정보 웹앱] 로컬 개발 서버를 실행합니다...
echo ==========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
