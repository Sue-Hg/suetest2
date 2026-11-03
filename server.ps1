[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$envFile = Join-Path $baseDir ".env.local"
$apiKey = ""
if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        if ($_ -match "^\s*AIRKOREA_KEY\s*=\s*(.+)$") {
            $apiKey = $matches[1].Trim()
        }
    }
}

$port = 3000
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    $port = 3001
    $prefix = "http://localhost:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host "=========================================================="
Write-Host " Air Korea Web App Local Server Running!"
Write-Host " Access URL: $prefix"
if ($apiKey) {
    Write-Host " AIRKOREA_KEY is loaded successfully."
} else {
    Write-Host " Warning: AIRKOREA_KEY is not found in .env.local."
}
Write-Host " Press Ctrl+C to stop the server."
Write-Host "=========================================================="

Start-Process $prefix

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    
    $request = $context.Request
    $response = $context.Response
    $path = $request.Url.AbsolutePath

    $response.Headers.Add("Access-Control-Allow-Origin", "*")

    if ($path -eq "/api/dust") {
        $sido = "서울"
        if ($request.Url.Query -match "[?&]sido=([^&]+)") {
            $sido = [System.Uri]::UnescapeDataString($matches[1])
        }

        if (-not $apiKey -or $apiKey -eq "여기에_디코딩_인증키를_입력하세요") {
            $response.StatusCode = 500
            $response.ContentType = "application/json; charset=utf-8"
            $errMsg = '{"message":"서버 환경변수(AIRKOREA_KEY)가 설정되지 않았습니다. .env.local을 확인해주세요."}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($errMsg)
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        $encodedKey = [System.Uri]::EscapeDataString($apiKey)
        $encodedSido = [System.Uri]::EscapeDataString($sido)
        $targetUrl = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey={0}&returnType=json&numOfRows=100&pageNo=1&sidoName={1}&ver=1.3" -f $encodedKey, $encodedSido

        try {
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
            $webClient = New-Object System.Net.WebClient
            $webClient.Encoding = [System.Text.Encoding]::UTF8
            $responseText = $webClient.DownloadString($targetUrl)

            if ($responseText.TrimStart().StartsWith("<")) {
                $response.StatusCode = 502
                $response.ContentType = "application/json; charset=utf-8"
                $xmlMsg = '{"message":"인증키 또는 요청값을 확인해주세요. (공공데이터포털에서 유효하지 않은 응답이 수신되었습니다.)"}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($xmlMsg)
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 200
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($responseText)
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            $response.StatusCode = 500
            $response.ContentType = "application/json; charset=utf-8"
            $errText = $_.Exception.Message.Replace('"', '\"')
            $errMsg = '{"message":"공공데이터포털 호출 오류: ' + $errText + '"}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($errMsg)
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
        continue
    }

    if ($path -eq "/" -or $path -eq "") {
        $path = "/index.html"
    }
    $relative = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $filePath = Join-Path $baseDir $relative

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $mime = switch ($ext) {
            ".html" { "text/html; charset=utf-8" }
            ".css"  { "text/css; charset=utf-8" }
            ".js"   { "application/javascript; charset=utf-8" }
            ".json" { "application/json; charset=utf-8" }
            default { "application/octet-stream" }
        }
        $response.ContentType = $mime
        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
    } else {
        $response.StatusCode = 404
        $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
    }
    $response.Close()
}