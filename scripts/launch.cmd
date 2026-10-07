@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
set "interpreter=runtime\cpython"
set "projectpath=../.."
if exist "runtime\python.exe" (
  set "interpreter=runtime"
  set "projectpath=.."
)
if exist "%interpreter%\python.exe" if exist "%interpreter%\python313.dll" if exist "%interpreter%\python313.zip" if exist "%interpreter%\python313._pth" goto run
if not exist "runtime\archives" mkdir "runtime\archives"
if exist "runtime\archives\python-3.13.16-embed-amd64.zip" (
  certutil.exe -hashfile "runtime\archives\python-3.13.16-embed-amd64.zip" SHA256 | findstr.exe /i /c:"97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297" >nul
  if not errorlevel 1 goto extract
)
echo Downloading the portable Python runtime...
curl.exe --fail --location --proto =https --proto-redir =https "https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip" --output "runtime\archives\python-3.13.16-embed-amd64.zip.download"
if errorlevel 1 goto failed
certutil.exe -hashfile "runtime\archives\python-3.13.16-embed-amd64.zip.download" SHA256 | findstr.exe /i /c:"97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297" >nul
if errorlevel 1 (
  echo Python runtime checksum verification failed.
  goto failed
)
move /y "runtime\archives\python-3.13.16-embed-amd64.zip.download" "runtime\archives\python-3.13.16-embed-amd64.zip" >nul
if errorlevel 1 goto failed
:extract
if not exist "%interpreter%" mkdir "%interpreter%"
tar.exe -xf "runtime\archives\python-3.13.16-embed-amd64.zip" -C "%interpreter%"
if errorlevel 1 goto failed
>"%interpreter%\python313._pth" (
  echo python313.zip
  echo .
  echo Lib/site-packages
  echo %projectpath%/src
  echo %projectpath%/scripts
  echo %projectpath%/tests
  echo import site
)
:run
"%interpreter%\python.exe" -u "scripts\%~1.py" %2
if errorlevel 1 goto failed
exit /b 0
:failed
echo Cake Tagger could not start. See the message above.
pause
exit /b 1
