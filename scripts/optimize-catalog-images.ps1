$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$productDir = Join-Path $root "assets\images\products"
$categoryDir = Join-Path $root "assets\images\categories"
New-Item -ItemType Directory -Force -Path $productDir, $categoryDir | Out-Null

function Convert-RemoteImage {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [int]$MaxSize = 560,
    [int]$Quality = 82
  )

  $tmp = Join-Path $env:TEMP ("delivery-img-" + [Guid]::NewGuid().ToString() + ".bin")
  try {
    Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing -TimeoutSec 25
    $img = [System.Drawing.Image]::FromFile($tmp)
    $ratio = [Math]::Min($MaxSize / $img.Width, $MaxSize / $img.Height)
    if ($ratio -gt 1) { $ratio = 1 }
    $width = [Math]::Max(1, [int]($img.Width * $ratio))
    $height = [Math]::Max(1, [int]($img.Height * $ratio))
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($img, 0, 0, $width, $height)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
    $bmp.Save($OutFile, $codec, $params)

    $graphics.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    return $true
  } catch {
    Write-Host "Falhou: $Url -> $($_.Exception.Message)"
    return $false
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Safe-Slug {
  param([string]$Text)
  $slug = $Text.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  $slug = $slug.Trim("-")
  if (!$slug) { return "item" }
  return $slug.Substring(0, [Math]::Min(42, $slug.Length))
}

$productsPath = Join-Path $root "products.json"
$categoriesPath = Join-Path $root "categories.json"
$products = Get-Content $productsPath -Raw | ConvertFrom-Json
$categories = Get-Content $categoriesPath -Raw | ConvertFrom-Json

$optimizedProducts = 0
$skippedProducts = 0
foreach ($product in $products) {
  if (-not ($product.image -match "^https?://")) { continue }
  $slug = Safe-Slug "$($product.id)-$($product.name)"
  $relative = "./assets/images/products/$slug.jpg"
  $out = Join-Path $root ($relative.TrimStart("./") -replace "/", "\")
  if ((Test-Path $out) -or (Convert-RemoteImage -Url $product.image -OutFile $out -MaxSize 560 -Quality 82)) {
    $product.image = $relative
    $optimizedProducts++
  } else {
    $skippedProducts++
  }
}

$optimizedCategories = 0
$skippedCategories = 0
foreach ($category in $categories) {
  $current = $category.image_url
  if (!$current) { $current = $category.image }
  if (-not ($current -match "^https?://")) { continue }
  $slug = Safe-Slug "$($category.id)-$($category.name)"
  $relative = "./assets/images/categories/$slug.jpg"
  $out = Join-Path $root ($relative.TrimStart("./") -replace "/", "\")
  if ((Test-Path $out) -or (Convert-RemoteImage -Url $current -OutFile $out -MaxSize 260 -Quality 78)) {
    $category.image_url = $relative
    $optimizedCategories++
  } else {
    $skippedCategories++
  }
}

$products | ConvertTo-Json -Depth 20 | Set-Content $productsPath -Encoding utf8
$categories | ConvertTo-Json -Depth 20 | Set-Content $categoriesPath -Encoding utf8

[pscustomobject]@{
  optimizedProducts = $optimizedProducts
  skippedProducts = $skippedProducts
  optimizedCategories = $optimizedCategories
  skippedCategories = $skippedCategories
} | ConvertTo-Json
