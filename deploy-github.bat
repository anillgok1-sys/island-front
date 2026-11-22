@echo off
chcp 65001 >nul
echo ========================================================
echo   ISLAND FRONT - GitHub + Render/Railway Bulut Yukleyici
echo ========================================================
echo.
echo [1/2] GitHub (https://github.com/anillgok1-sys/island-front) deposuna gonderiliyor...
echo       (Eger GitHub'da 'island-front' adinda bos bir repo acmadiysaniz once tarayicida acilacak sayfadan olusturun)
start https://github.com/new?name=island-front^&description=ISLAND+FRONT+3D+Open+World+Multiplayer+Warfare
pause
git branch -M main
git push -u origin main
echo.
echo [2/2] Render veya Railway uzerinden tek tikla yayina almak icin:
echo       - Render:  https://dashboard.render.com/select-repo?type=web
echo       - Railway: https://railway.app/new/github
start https://dashboard.render.com/select-repo?type=web
pause
