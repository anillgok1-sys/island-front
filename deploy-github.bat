@echo off
chcp 65001 >nul
echo ========================================================
echo   ISLAND FRONT - GitHub Baglantisi ve Otomatik Yukleme
echo ========================================================
echo.
echo [1/3] GitHub tarayici yetkisi baglaniyor (Tarayicida 'Authorize' butonuna tiklayin)...
git credential-manager github login --browser
echo.
echo [2/3] Oyun kodlari https://github.com/anillgok1-sys/island-front deposuna yukleniyor...
git branch -M main
git push -u origin main
echo.
echo [3/3] Render.com dagitim ekrani aciliyor ('island-front' reposunu secip Deploy'a basin)...
start https://dashboard.render.com/select-repo?type=web
echo.
echo Tamamlandi! Artik GitHub yetkisi Windows'a kaydedildi.
pause
