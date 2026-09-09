@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..\..") do set "PLUGIN_ROOT=%%~fI"
node "%PLUGIN_ROOT%\src\impeccable-launcher.mjs" %*
exit /b %errorlevel%
