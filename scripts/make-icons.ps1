$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'android\app\src\main\res'

$launcherSizes = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
$foregroundSizes = @{ mdpi = 108; hdpi = 162; xhdpi = 216; xxhdpi = 324; xxxhdpi = 432 }

function Get-SpadeFont([double]$size) {
    foreach ($name in @('Microsoft YaHei', 'KaiTi', 'SimHei', 'Segoe UI Symbol', 'Arial Unicode MS', 'Arial')) {
        try {
            return New-Object System.Drawing.Font(
                $name, $size,
                [System.Drawing.FontStyle]::Regular,
                [System.Drawing.GraphicsUnit]::Pixel)
        } catch {
            continue
        }
    }
    return New-Object System.Drawing.Font(
        'Arial', $size,
        [System.Drawing.FontStyle]::Regular,
        [System.Drawing.GraphicsUnit]::Pixel)
}

function New-BrandIcon {
    param(
        [int]$Size,
        [string]$Path,
        [bool]$Round = $false,
        [bool]$Transparent = $false,
        [bool]$Foreground = $false
    )

    $bmp = New-Object System.Drawing.Bitmap(
        $Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    if (-not $Transparent) {
        $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
        $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $rect,
            [System.Drawing.Color]::FromArgb(255, 15, 22, 21),
            [System.Drawing.Color]::FromArgb(255, 5, 6, 8),
            68.0)
        if ($Round) {
            $g.FillEllipse($bg, 0, 0, $Size - 1, $Size - 1)
        } else {
            $g.FillRectangle($bg, $rect)
        }
        $bg.Dispose()

        $inset = [Math]::Max(1, [int]($Size * 0.14))
        $penWidth = [Math]::Max(1.0, $Size * 0.018)
        $pen = New-Object System.Drawing.Pen(
            [System.Drawing.Color]::FromArgb(130, 217, 185, 119), $penWidth)
        $g.DrawEllipse($pen, $inset, $inset, $Size - 2 * $inset - 1, $Size - 2 * $inset - 1)
        $pen.Dispose()
    } else {
        $penWidth = [Math]::Max(1.0, $Size * 0.012)
        $inset = [int]($Size * 0.31)
        $pen = New-Object System.Drawing.Pen(
            [System.Drawing.Color]::FromArgb(95, 217, 185, 119), $penWidth)
        $g.DrawEllipse($pen, $inset, $inset, $Size - 2 * $inset, $Size - 2 * $inset)
        $pen.Dispose()
    }

    if ($Foreground) {
        $glyphSize = $Size * 0.36
    } elseif ($Round) {
        $glyphSize = $Size * 0.46
    } else {
        $glyphSize = $Size * 0.52
    }

    $font = Get-SpadeFont $glyphSize
    $brush = New-Object System.Drawing.SolidBrush(
        [System.Drawing.Color]::FromArgb(255, 234, 203, 145))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $offsetY = [float](-1 * $Size * 0.02)
    $box = New-Object System.Drawing.RectangleF([float]0, $offsetY, [float]$Size, [float]$Size)
    $mark = [string][char]0x5FB7
    $g.DrawString($mark, $font, $brush, $box, $format)

    $format.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

foreach ($density in $launcherSizes.Keys) {
    $dir = Join-Path $res "mipmap-$density"
    New-BrandIcon -Size $launcherSizes[$density] -Path (Join-Path $dir 'ic_launcher.png')
    New-BrandIcon -Size $launcherSizes[$density] -Path (Join-Path $dir 'ic_launcher_round.png') -Round $true
    New-BrandIcon -Size $foregroundSizes[$density] -Path (Join-Path $dir 'ic_launcher_foreground.png') -Transparent $true -Foreground $true
    Write-Host "icons: $density"
}

New-BrandIcon -Size 512 -Path (Join-Path $root 'android\icon-512.png')
Write-Host 'Icons generated'
