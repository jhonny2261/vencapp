@echo off
title Control de Vencimientos - Servidor
color 0A

echo.
echo  ================================================
echo    Control de Vencimientos - v2.0
echo    Iniciando servidor...
echo  ================================================
echo.

cd /d "%~dp0"

echo  Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] Node.js no esta instalado.
    echo  Ejecute primero INSTALAR.bat
    pause
    exit
)

:: Verificar que las dependencias esten instaladas
if not exist "node_modules\express" (
    color 0E
    echo.
    echo  [AVISO] Las dependencias no estan instaladas.
    echo  Ejecutando instalacion automatica...
    echo.
    npm install
)

echo  [OK] Node.js detectado.
echo.
echo  ============================================
echo  Accede al sistema en tu navegador:
echo    https://localhost:3002
echo.
echo  Para acceso desde celular usa la IP
echo  de esta computadora en la red WiFi.
echo.
echo  Presiona Ctrl+C para detener el servidor.
echo  ============================================
echo.

npm start

pause
