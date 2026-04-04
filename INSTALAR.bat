@echo off
title Control de Vencimientos - Instalador
color 0B

echo.
echo  ================================================
echo    Control de Vencimientos - v2.0
echo    Instalador de Dependencias
echo  ================================================
echo.

cd /d "%~dp0"

echo  Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] Node.js no esta instalado.
    echo  Descargalo desde: https://nodejs.org
    echo.
    pause
    exit
)

echo  [OK] Node.js:
node --version
echo  [OK] NPM:
npm --version
echo.

echo  ============================================
echo  Instalando dependencias...
echo  Esto puede tardar unos minutos...
echo  ============================================
echo.

npm install

if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] Fallo la instalacion de dependencias.
    echo  Verifique su conexion a internet e intente nuevamente.
    pause
    exit
)

color 0A
echo.
echo  ============================================
echo    INSTALACION COMPLETADA EXITOSAMENTE!
echo  ============================================
echo.
echo  La base de datos se creara automaticamente
echo  la primera vez que inicie el servidor.
echo.
echo  Ejecute INICIAR_SERVIDOR.bat para arrancar.
echo.

pause
