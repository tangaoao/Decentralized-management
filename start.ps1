# 二次发放审批系统 — 一键启动脚本
# 用途：同时启动后端 (Express :5000) 和前端 (React :3000)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  二次发放审批系统 — 一键启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 设置 JWT 密钥
$env:JWT_SECRET = "secondary_approval_jwt_secret_2026"
Write-Host "`n[1/4] JWT_SECRET 已设置" -ForegroundColor Green

# 2. 后端依赖检查与安装
$serverDir = Join-Path $root "server"
if (-not (Test-Path (Join-Path $serverDir "node_modules"))) {
    Write-Host "[2/4] 安装后端依赖..." -ForegroundColor Yellow
    Set-Location $serverDir
    npm install
} else {
    Write-Host "[2/4] 后端依赖已就绪" -ForegroundColor Green
}

# 3. 前端依赖检查与安装
$clientDir = Join-Path $root "client"
if (-not (Test-Path (Join-Path $clientDir "node_modules"))) {
    Write-Host "[3/4] 安装前端依赖..." -ForegroundColor Yellow
    Set-Location $clientDir
    npm install
} else {
    Write-Host "[3/4] 前端依赖已就绪" -ForegroundColor Green
}

# 4. 启动服务
Write-Host "[4/4] 启动后端 & 前端...`n" -ForegroundColor Green
Write-Host "后端: http://localhost:5000" -ForegroundColor White
Write-Host "前端: http://localhost:3000" -ForegroundColor White
Write-Host "按 Ctrl+C 停止所有服务`n" -ForegroundColor DarkGray

# 分别启动两个进程
$procServer = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$serverDir'; `$env:JWT_SECRET='secondary_approval_jwt_secret_2026'; Write-Host '[后端] 启动中...' -ForegroundColor Yellow; npm start" -PassThru

$procClient = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$clientDir'; Write-Host '[前端] 启动中...' -ForegroundColor Yellow; npm start" -PassThru

Write-Host "后端 PID: $($procServer.Id)" -ForegroundColor DarkGray
Write-Host "前端 PID: $($procClient.Id)" -ForegroundColor DarkGray
Write-Host "`n等待服务就绪..." -ForegroundColor Yellow

# 等待后端就绪
$retries = 0
while ($retries -lt 30) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            Write-Host "`n✓ 后端已就绪" -ForegroundColor Green
            break
        }
    } catch { }
    $retries++
    Start-Sleep -Seconds 1
}

# 等待前端就绪
$retries = 0
while ($retries -lt 60) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            Write-Host "✓ 前端已就绪" -ForegroundColor Green
            break
        }
    } catch { }
    $retries++
    Start-Sleep -Seconds 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  系统启动完成！浏览器打开:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n按任意键关闭本窗口（不影响服务运行）..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
