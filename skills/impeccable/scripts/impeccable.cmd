@echo off
setlocal EnableExtensions
rem Do not set PLUGIN_ROOT here; that env var selects the Codex host in resolveHost.
for %%I in ("%~dp0..\..\..") do set "DESIGN_LAUNCHER_ROOT=%%~fI"
node "%DESIGN_LAUNCHER_ROOT%\src\impeccable-launcher.mjs" %*
exit /b %errorlevel%
