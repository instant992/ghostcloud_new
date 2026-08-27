@echo off
set "JAVA_HOME=C:\Tools\jdk17"
set "ANDROID_HOME=C:\Android\Sdk"
set "ANDROID_SDK_ROOT=C:\Android\Sdk"
set "PATH=C:\Tools\node;C:\Tools\jdk17\bin;%PATH%"
cd /d "%~dp0android"
call gradlew.bat assembleRelease --no-daemon --max-workers=2 > "..\build_log.txt" 2>&1
echo EXIT=%ERRORLEVEL%>> "..\build_log.txt"
