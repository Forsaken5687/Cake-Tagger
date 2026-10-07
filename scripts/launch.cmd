@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
if exist "runtime\cpython\python.exe" goto run
if not exist "runtime\archives" mkdir "runtime\archives"
if not exist "runtime\archives\python-3.13.16-embed-amd64.zip" (
  echo Downloading the portable Python runtime...
  curl.exe --fail --location --proto =https --proto-redir =https "https://www.python.org/ftp/python/3.13.16/python-3.13.16-embed-amd64.zip" --output "runtime\archives\python-3.13.16-embed-amd64.zip"
  if errorlevel 1 goto failed
)
certutil.exe -hashfile "runtime\archives\python-3.13.16-embed-amd64.zip" SHA256 | findstr.exe /i /c:"97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297" >nul
if errorlevel 1 (
  echo Python runtime checksum verification failed. Remove the damaged archive and run Setup.cmd again.
  goto failed
)
if not exist "runtime\cpython" mkdir "runtime\cpython"
tar.exe -xf "runtime\archives\python-3.13.16-embed-amd64.zip" -C "runtime\cpython"
if errorlevel 1 goto failed
>"runtime\cpython\python313._pth" (
  echo python313.zip
  echo .
  echo Lib/site-packages
  echo ../../src
  echo ../../scripts
  echo ../../tests
  echo import site
)
:run
"runtime\cpython\python.exe" -u "scripts\%~1.py" %2
if errorlevel 1 goto failed
exit /b 0
:failed
echo Cake Tagger could not start. See the message above.
pause
exit /b 1
