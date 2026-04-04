@echo off
title Control de Vencimientos - Empaquetador EXE
color 0B

echo.
echo  ================================================
echo    Control de Vencimientos - v2.0
echo    Creador de instalador .EXE para clientes
echo  ================================================
echo.

cd /d "%~dp0"

echo  [1/5] Preparando carpeta de salida...
if not exist "dist" mkdir dist
echo  [OK] Carpeta dist lista.

echo.
echo  [2/5] Compilando ControlVencimientos.exe (servidor)...
echo  Este proceso puede tardar varios minutos.
echo  (Si se descarga el runtime de Node puede demorar mas la primera vez)
echo.

"C:\Users\Jhony\AppData\Roaming\npm\pkg.cmd" server.js --targets node18-win-x64 --output dist\ControlVencimientos.exe --compress GZip

echo.
if not exist "dist\ControlVencimientos.exe" (
    color 0C
    echo  ================================================
    echo  [ERROR] No se genero ControlVencimientos.exe
    echo  ================================================
    echo.
    echo  Posibles causas:
    echo    1. pkg no pudo descargar el runtime de Node18
    echo       Solicion: conectarse a internet y volver a ejecutar.
    echo    2. Antivirus bloqueando la creacion del .exe
    echo       Solucion: agregar excepcion para esta carpeta.
    echo    3. La carpeta dist no tiene permisos de escritura
    echo       Solucion: ejecutar este .bat como Administrador.
    echo.
    pause
    exit /b 1
)
echo  [OK] ControlVencimientos.exe generado.

echo.
echo  [3/5] Compilando AbrirSistema.exe (lanzador)...
echo.

"C:\Users\Jhony\AppData\Roaming\npm\pkg.cmd" lanzador.js --targets node18-win-x64 --output dist\AbrirSistema.exe --compress GZip

echo.
if not exist "dist\AbrirSistema.exe" (
    color 0C
    echo  ================================================
    echo  [ERROR] No se genero AbrirSistema.exe
    echo  ================================================
    echo.
    echo  Posibles causas:
    echo    1. pkg no pudo descargar el runtime de Node18
    echo       Solucion: conectarse a internet y volver a ejecutar.
    echo    2. Antivirus bloqueando la creacion del .exe
    echo       Solucion: agregar excepcion para esta carpeta.
    echo    3. La carpeta dist no tiene permisos de escritura
    echo       Solucion: ejecutar este .bat como Administrador.
    echo.
    pause
    exit /b 1
)
echo  [OK] AbrirSistema.exe generado.

echo.
echo  [4/5] Copiando archivos necesarios...

if exist "node_modules\sql.js\dist\sql-wasm.wasm" (
    if not exist "dist\node_modules\sql.js\dist" mkdir "dist\node_modules\sql.js\dist"
    copy "node_modules\sql.js\dist\sql-wasm.wasm" "dist\node_modules\sql.js\dist\" >nul
    echo  [OK] sql-wasm.wasm copiado.
)

if not exist "dist\public" mkdir "dist\public"
xcopy "public" "dist\public" /E /I /Q >nul
echo  [OK] Carpeta public copiada.

if exist ".env" (
    copy ".env" "dist\.env" >nul
    echo  [OK] .env copiado.
)

if not exist "dist\data" mkdir "dist\data"
echo  [OK] Carpeta data creada vacia.

echo.
echo  [5/5] Creando archivo DETENER...

echo @echo off > "dist\DETENER.bat"
echo taskkill /F /IM ControlVencimientos.exe ^>nul 2^>^&1 >> "dist\DETENER.bat"
echo echo Servidor detenido. >> "dist\DETENER.bat"
echo pause >> "dist\DETENER.bat"

echo  [OK] DETENER.bat creado.

color 0A
echo.
echo  ================================================
echo    EMPAQUETADO COMPLETADO EXITOSAMENTE
echo  ================================================
echo.
echo  Archivos generados en la carpeta dist:
echo    - ControlVencimientos.exe  (servidor principal)
echo    - AbrirSistema.exe         (lanzador — el cliente solo toca este)
echo    - DETENER.bat              (para apagar el servidor)
echo.
echo  IMPORTANTE: Ambos .exe deben estar siempre en la misma carpeta.
echo  Crear acceso directo en el Escritorio apuntando a AbrirSistema.exe.
echo.
echo  Archivos en dist:
echo.
dir dist\ /b
echo.
pause
