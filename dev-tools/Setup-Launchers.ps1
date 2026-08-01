<#
BRAZOS Developer Control Center - launcher generator.

Regenerates dev-tools/icons/*.ico and dev-tools/launchers/*.lnk from the
scripts in dev-tools/scripts/. Safe to re-run any time (e.g. after moving
the repository folder, or to restyle the icons) - it only touches files
inside dev-tools/icons and dev-tools/launchers.

Does not touch the Windows registry, install anything, or modify any
application code. Run it from PowerShell:

    powershell -ExecutionPolicy Bypass -File "dev-tools\Setup-Launchers.ps1"
#>

param(
    [switch]$SkipIcons
)

Add-Type -AssemblyName System.Drawing

$devTools     = $PSScriptRoot
$projectRoot  = Split-Path $devTools -Parent
$scriptsDir   = Join-Path $devTools "scripts"
$iconsDir     = Join-Path $devTools "icons"
$launchersDir = Join-Path $devTools "launchers"

New-Item -ItemType Directory -Force -Path $iconsDir, $launchersDir | Out-Null

if (-not (Test-Path $scriptsDir)) {
    Write-Error "scripts folder not found at: $scriptsDir"
    exit 1
}

# One entry per launcher: Name matches both the .bat (in scripts/) and the
# generated .ico/.lnk (in icons/ and launchers/), so everything stays paired
# by convention. Color/Glyph drive the icon's look.
$launchers = @(
    @{ Name = "Start BRAZOS";        Color = "#2E7D32"; Glyph = "play" }
    @{ Name = "Restart BRAZOS";      Color = "#1565C0"; Glyph = "refresh" }
    @{ Name = "Stop BRAZOS";         Color = "#C62828"; Glyph = "stop" }
    @{ Name = "Open VS Code";        Color = "#1E88E5"; Glyph = "code" }
    @{ Name = "Open Claude Code";    Color = "#EF6C00"; Glyph = "prompt" }
    @{ Name = "Build Android";       Color = "#43A047"; Glyph = "android" }
    @{ Name = "Build iOS";           Color = "#424242"; Glyph = "phone" }
    @{ Name = "Start Web";           Color = "#00838F"; Glyph = "globe" }
    @{ Name = "Clear Expo Cache";    Color = "#F4511E"; Glyph = "trash" }
    @{ Name = "Run Tests";           Color = "#00897B"; Glyph = "check" }
    @{ Name = "Project Status";      Color = "#5E35B1"; Glyph = "bars" }
    @{ Name = "Git Checkpoint";      Color = "#37474F"; Glyph = "flag" }
    @{ Name = "Open Project Folder"; Color = "#F9A825"; Glyph = "folder" }
    @{ Name = "Health Check";        Color = "#D81B60"; Glyph = "cross" }
)

function New-RoundedRectPath {
    param([single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Glyph {
    param([System.Drawing.Graphics]$g, [string]$Glyph, [System.Drawing.Color]$Bg)

    $white = [System.Drawing.Brushes]::White
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 16)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    switch ($Glyph) {
        "play" {
            $pts = @(
                [System.Drawing.PointF]::new(100, 82),
                [System.Drawing.PointF]::new(100, 174),
                [System.Drawing.PointF]::new(180, 128)
            )
            $g.FillPolygon($white, $pts)
        }
        "refresh" {
            $g.DrawArc($pen, 64, 64, 128, 128, 300, 260)
            # arrowhead at the end of the arc (angle 200 deg on the circle)
            $rad = [Math]::PI / 180
            $endAngle = 200
            $cx = 128.0; $cy = 128.0; $r = 64.0
            $tipX = $cx + $r * [Math]::Cos($endAngle * $rad)
            $tipY = $cy + $r * [Math]::Sin($endAngle * $rad)
            $a1 = ($endAngle - 40) * $rad
            $a2 = ($endAngle + 40) * $rad
            $p1 = [System.Drawing.PointF]::new($cx + ($r + 22) * [Math]::Cos($a1), $cy + ($r + 22) * [Math]::Sin($a1))
            $p2 = [System.Drawing.PointF]::new($cx + ($r - 22) * [Math]::Cos($a2), $cy + ($r - 22) * [Math]::Sin($a2))
            $tip = [System.Drawing.PointF]::new($tipX, $tipY)
            $g.FillPolygon($white, @($p1, $tip, $p2))
        }
        "stop" {
            $path = New-RoundedRectPath -X 92 -Y 92 -W 72 -H 72 -R 12
            $g.FillPath($white, $path)
        }
        "code" {
            $left = @(
                [System.Drawing.PointF]::new(112, 84),
                [System.Drawing.PointF]::new(76, 128),
                [System.Drawing.PointF]::new(112, 172)
            )
            $right = @(
                [System.Drawing.PointF]::new(144, 84),
                [System.Drawing.PointF]::new(180, 128),
                [System.Drawing.PointF]::new(144, 172)
            )
            $g.DrawLines($pen, $left)
            $g.DrawLines($pen, $right)
        }
        "prompt" {
            $chevron = @(
                [System.Drawing.PointF]::new(82, 92),
                [System.Drawing.PointF]::new(118, 128),
                [System.Drawing.PointF]::new(82, 164)
            )
            $g.DrawLines($pen, $chevron)
            $g.DrawLine($pen, 128, 168, 176, 168)
        }
        "android" {
            $body = New-Object System.Drawing.Drawing2D.GraphicsPath
            $body.AddArc(88, 92, 80, 80, 180, 180)
            $body.AddLine(168, 132, 168, 172)
            $body.AddLine(168, 172, 88, 172)
            $body.CloseFigure()
            $g.FillPath($white, $body)
            $g.DrawLine($pen, 104, 94, 92, 76)
            $g.DrawLine($pen, 152, 94, 164, 76)
            $bgBrush = New-Object System.Drawing.SolidBrush($Bg)
            $g.FillEllipse($bgBrush, 112, 118, 12, 12)
            $g.FillEllipse($bgBrush, 132, 118, 12, 12)
        }
        "phone" {
            $path = New-RoundedRectPath -X 98 -Y 68 -W 60 -H 120 -R 14
            $g.FillPath($white, $path)
            $bgBrush = New-Object System.Drawing.SolidBrush($Bg)
            $g.FillRectangle($bgBrush, 112, 78, 32, 6)
            $g.FillEllipse($bgBrush, 121, 168, 14, 14)
        }
        "globe" {
            $gp = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 10)
            $g.DrawEllipse($gp, 68, 68, 120, 120)
            $g.DrawEllipse($gp, 104, 68, 48, 120)
            $g.DrawLine($gp, 68, 128, 188, 128)
        }
        "trash" {
            $lid = New-RoundedRectPath -X 84 -Y 92 -W 88 -H 14 -R 4
            $g.FillPath($white, $lid)
            $handle = New-RoundedRectPath -X 112 -Y 76 -W 32 -H 14 -R 6
            $g.FillPath($white, $handle)
            $bgBrush = New-Object System.Drawing.SolidBrush($Bg)
            $g.FillRectangle($bgBrush, 112, 76, 32, 8)
            $body = New-RoundedRectPath -X 92 -Y 110 -W 72 -H 76 -R 10
            $g.FillPath($white, $body)
        }
        "check" {
            $pts = @(
                [System.Drawing.PointF]::new(80, 132),
                [System.Drawing.PointF]::new(112, 164),
                [System.Drawing.PointF]::new(180, 92)
            )
            $g.DrawLines($pen, $pts)
        }
        "bars" {
            $g.FillRectangle($white, 82, 116, 26, 60)
            $g.FillRectangle($white, 115, 88, 26, 88)
            $g.FillRectangle($white, 148, 60, 26, 116)
        }
        "flag" {
            $g.DrawLine($pen, 92, 78, 92, 178)
            $pts = @(
                [System.Drawing.PointF]::new(100, 82),
                [System.Drawing.PointF]::new(172, 100),
                [System.Drawing.PointF]::new(100, 128)
            )
            $g.FillPolygon($white, $pts)
        }
        "folder" {
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddRectangle([System.Drawing.RectangleF]::new(80, 88, 56, 16))
            $body = New-RoundedRectPath -X 80 -Y 100 -W 120 -H 82 -R 8
            $g.FillPath($white, $path)
            $g.FillPath($white, $body)
        }
        "cross" {
            $g.FillRectangle($white, 116, 84, 24, 88)
            $g.FillRectangle($white, 84, 116, 88, 24)
        }
        default {
            $g.FillEllipse($white, 96, 96, 64, 64)
        }
    }
}

function New-BrazosIcon {
    param([string]$Name, [string]$ColorHex, [string]$Glyph, [string]$OutPath)

    $bmp = New-Object System.Drawing.Bitmap(256, 256)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = [System.Drawing.ColorTranslator]::FromHtml($ColorHex)
    $bgBrush = New-Object System.Drawing.SolidBrush($bg)
    $bgPath = New-RoundedRectPath -X 8 -Y 8 -W 240 -H 240 -R 44
    $g.FillPath($bgBrush, $bgPath)

    Draw-Glyph -g $g -Glyph $Glyph -Bg $bg

    $g.Dispose()

    # Wrap a PNG in a minimal single-frame ICO container (Windows has
    # supported PNG-compressed icon frames since Vista).
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()
    $ms.Close()
    $bmp.Dispose()

    $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]1)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngBytes.Length)
    $bw.Write([UInt32]22)
    $bw.Write($pngBytes)
    $bw.Flush()
    $bw.Close()
    $fs.Close()
}

function New-BrazosShortcut {
    param([string]$LnkPath, [string]$TargetPath, [string]$IconPath, [string]$WorkingDirectory, [string]$Description)

    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($LnkPath)
    $sc.TargetPath = $TargetPath
    $sc.WorkingDirectory = $WorkingDirectory
    $sc.IconLocation = "$IconPath,0"
    $sc.Description = $Description
    $sc.WindowStyle = 1
    $sc.Save()
    [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($shell)
}

Write-Host "BRAZOS Developer Control Center - launcher setup" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot"
Write-Host ""

$results = @()

foreach ($item in $launchers) {
    $name = $item.Name
    $batPath = Join-Path $scriptsDir "$name.bat"
    $icoPath = Join-Path $iconsDir "$name.ico"
    $lnkPath = Join-Path $launchersDir "$name.lnk"

    if (-not (Test-Path $batPath)) {
        Write-Warning "Skipping '$name' - script not found: $batPath"
        continue
    }

    if (-not $SkipIcons) {
        New-BrazosIcon -Name $name -ColorHex $item.Color -Glyph $item.Glyph -OutPath $icoPath
    }

    New-BrazosShortcut -LnkPath $lnkPath -TargetPath $batPath -IconPath $icoPath `
        -WorkingDirectory $projectRoot -Description "BRAZOS dev tool: $name"

    $results += [PSCustomObject]@{
        Name   = $name
        Script = Test-Path $batPath
        Icon   = Test-Path $icoPath
        Shortcut = Test-Path $lnkPath
    }
}

Write-Host ""
Write-Host "Generated $($results.Count) launcher(s):" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$failed = $results | Where-Object { -not ($_.Script -and $_.Icon -and $_.Shortcut) }
if ($failed) {
    Write-Host "WARNING: some launchers are incomplete - see table above." -ForegroundColor Yellow
} else {
    Write-Host "All launchers created successfully in: $launchersDir" -ForegroundColor Green
}
