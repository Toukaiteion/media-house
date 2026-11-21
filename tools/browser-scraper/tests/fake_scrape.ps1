param(
    [Parameter(Mandatory = $true)][string]$Num,
    [Parameter(Mandatory = $true)][string]$Out
)

# 模拟 jcatch 的产出：<Out>/<Num>/{nfo, 三张图, extrafanart/}
# 只是给 tests/upload_test.py 走通「搜刮 → 打包 → 上传」用的。
$ErrorActionPreference = 'Stop'

$target = Join-Path $Out $Num
$extra = Join-Path $target 'extrafanart'
New-Item -ItemType Directory -Path $extra -Force | Out-Null

# 在输出根额外写一个文件：用来验证打包逻辑不依赖「输出目录下只有一个子目录」
Set-Content -Path (Join-Path $Out '_root_note.txt') -Value 'simulate extra file at output root' -Encoding UTF8

Write-Output "[fake] scraping $Num -> $target"

# 1x1 JPEG
$jpeg = [Convert]::FromBase64String(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
)

foreach ($name in @('poster', 'thumb', 'fanart')) {
    [IO.File]::WriteAllBytes((Join-Path $target "$Num-$name.jpg"), $jpeg)
}
1..2 | ForEach-Object {
    [IO.File]::WriteAllBytes((Join-Path $extra "extrafanart-$_.jpg"), $jpeg)
}

$nfo = @"
<?xml version="1.0" encoding="UTF-8" ?>
<movie>
  <title>FAKE TITLE $Num</title>
  <num>$Num</num>
  <outline>fake plot</outline>
  <poster>$Num-poster.jpg</poster>
  <thumb>$Num-thumb.jpg</thumb>
  <fanart>$Num-fanart.jpg</fanart>
  <tag>fakeTag</tag>
  <actor><name>Fake Actor</name></actor>
</movie>
"@

Set-Content -Path (Join-Path $target "$Num.nfo") -Value $nfo -Encoding UTF8
Write-Output '[fake] done: 5 images + nfo'
