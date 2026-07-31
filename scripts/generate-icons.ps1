param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
$sourceImage = [System.Drawing.Image]::FromFile($resolvedSource)

try {
  if ($sourceImage.Width -ne $sourceImage.Height) {
    throw "The icon source must be square."
  }

  if ($sourceImage.Width -lt 1024) {
    throw "The icon source must be at least 1024x1024."
  }

  function Export-SquarePng {
    param(
      [System.Drawing.Image]$Image,
      [int]$Size,
      [string]$Destination
    )

    $bitmap = [System.Drawing.Bitmap]::new(
      $Size,
      $Size,
      [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.DrawImage($Image, 0, 0, $Size, $Size)
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }

  Copy-Item -LiteralPath $resolvedSource -Destination (
    Join-Path $projectRoot 'assets\brazos-logo-source.png'
  ) -Force

  $exports = @(
    @{ Size = 1024; Path = 'assets\icon.png' },
    @{ Size = 512; Path = 'public\icon-512.png' },
    @{ Size = 192; Path = 'public\icon-192.png' },
    @{ Size = 180; Path = 'public\apple-touch-icon.png' },
    @{ Size = 64; Path = 'assets\favicon.png' }
  )

  foreach ($export in $exports) {
    Export-SquarePng `
      -Image $sourceImage `
      -Size $export.Size `
      -Destination (Join-Path $projectRoot $export.Path)
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Output 'Generated BRAZOS production icon assets.'
