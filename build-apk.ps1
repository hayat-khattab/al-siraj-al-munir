param(
  [string]$LanIp = '10.2.0.2',
  [string]$Tmp = "$env:TEMP\opencode"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($root -eq '') { $root = 'C:\Users\Rock\OneDrive\Desktop\App-Seraj-Monir' }
$web = Join-Path $root 'web'

function ExtractZip($zip, $dest) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest) | Out-Null
  Write-Host "extracted $zip -> $dest"
}

# 1. Locate zips (must be complete). BITS jobs keep downloading them.
$jdkZip = Join-Path $Tmp 'jdk17.zip'
$cmdZip = Join-Path $Tmp 'cmdline-tools.zip'
$gradleZip = Join-Path $Tmp 'gradle.zip'
$platZip = Join-Path $Tmp 'platform-36.zip'
$btZip = Join-Path $Tmp 'build-tools.zip'
$ptZip = Join-Path $Tmp 'platform-tools.zip'
$required = @($jdkZip, $cmdZip, $gradleZip, $platZip, $btZip, $ptZip)
foreach ($f in $required) {
  if (-not (Test-Path $f)) { throw "missing $f - still downloading. Run again later." }
  try { $z = [System.IO.Compression.ZipFile]::OpenRead($f); $z.Dispose() } catch { throw "$f incomplete - still downloading. Run again later." }
}

# 2. Extract JDK
$jdkHome = 'C:\Users\Rock\AppData\Local\Programs\jdk-17'
if (-not (Test-Path (Join-Path $jdkHome 'bin\java.exe'))) {
  $tmpJdk = Join-Path $Tmp 'jdk-extract'
  Remove-Item $tmpJdk -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $tmpJdk -Force | Out-Null
  ExtractZip $jdkZip $tmpJdk
  $inner = Get-ChildItem $tmpJdk -Directory | Select-Object -First 1
  Move-Item -Path $inner.FullName -Destination $jdkHome
  Remove-Item $tmpJdk -Recurse -Force -ErrorAction SilentlyContinue
}
$env:JAVA_HOME = $jdkHome
$env:Path = "$jdkHome\bin;$env:Path"

# 3. Extract Android cmdline-tools into ANDROID_HOME
$sdkHome = 'C:\Users\Rock\Android\Sdk'
$cmdTools = Join-Path $sdkHome 'cmdline-tools\latest'
if (-not (Test-Path (Join-Path $cmdTools 'bin\sdkmanager.bat'))) {
  $tmpCmd = Join-Path $Tmp 'cmd-extract'
  Remove-Item $tmpCmd -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $tmpCmd -Force | Out-Null
  ExtractZip $cmdZip $tmpCmd
  New-Item -ItemType Directory -Path (Split-Path $cmdTools) -Force | Out-Null
  Move-Item -Path (Join-Path $tmpCmd 'cmdline-tools') -Destination $cmdTools
  Remove-Item $tmpCmd -Recurse -Force -ErrorAction SilentlyContinue
}

# 4. Lay out SDK packages (the zips already are the exact package contents)
function UnzipInto($zip, $target) {
  if (Test-Path $target) { return }
  $tmpZone = Join-Path $Tmp ('sdkext-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmpZone -Force | Out-Null
  ExtractZip $zip $tmpZone
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Get-ChildItem $tmpZone | Move-Item -Destination $target
  Remove-Item $tmpZone -Recurse -Force -ErrorAction SilentlyContinue
}
UnzipInto $ptZip  (Join-Path $sdkHome 'platform-tools')
UnzipInto $platZip (Join-Path $sdkHome 'platforms\android-36')
UnzipInto $btZip  (Join-Path $sdkHome 'build-tools\36.0.0')

# 5. Accept licenses (required for AGP)
$licDir = Join-Path $sdkHome 'licenses'
New-Item -ItemType Directory -Path $licDir -Force | Out-Null
$licenses = @{
  'android-sdk-license' = '24333f8a63b6825ea9c5514f83c2829b004d1fee'
  'android-sdk-preview-license' = '84831b9409646a918e30573bab4c9c91346d8abd'
}
foreach ($k in $licenses.Keys) {
  Set-Content -Path (Join-Path $licDir $k) -Value $licenses[$k]
}
$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome

# 6. Point gradle wrapper to the local gradle zip (saves a re-download)
$props = Join-Path $web 'android\gradle\wrapper\gradle-wrapper.properties'
$rel = $gradleZip.Substring(3) -replace '\\', '/'
$fileUrl = "file\:///C\:/$rel"
$content = Get-Content $props -Raw
$content = [regex]::Replace($content, '(?m)^distributionUrl=.*$', "distributionUrl=$fileUrl")
Set-Content -Path $props -Value $content -NoNewline

# 7. Build web bundle pointed at the phone-visible API
$env:VITE_API_URL = "http://$LanIp`:4000/api"
Write-Host "building web with VITE_API_URL=$env:VITE_API_URL"
Push-Location $web
try {
  npm.cmd run build
  npx.cmd cap sync android
} finally { Pop-Location }

# 8. Assemble APK (offline-ish; first run still downloads Maven deps)
Push-Location (Join-Path $web 'android')
try {
  .\gradlew.bat --no-daemon assembleDebug
} finally { Pop-Location }

# 9. Copy APK up to the project root
$apk = Join-Path $web 'android\app\build\outputs\apk\debug\app-debug.apk'
$dest = Join-Path $root 'Al-Siraj-Al-Munir.apk'
Copy-Item $apk $dest -Force
Write-Host "APK ready: $dest"