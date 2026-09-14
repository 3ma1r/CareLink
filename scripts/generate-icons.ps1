Add-Type -AssemblyName System.Drawing
$workspace = Split-Path -Parent $PSScriptRoot
foreach ($entry in @(@('icon-192.png',192), @('icon-512.png',512), @('icon-maskable.png',512), @('apple-touch-icon.png',180))) {
  $size = [int]$entry[1]
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#007b78'))
  $graphics.ScaleTransform($size / 512.0, $size / 512.0)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddBezier(256,357,90,261,147,119,232,185)
  $path.AddLine(232,185,256,208)
  $path.AddLine(256,208,280,185)
  $path.AddBezier(280,185,365,119,422,261,256,357)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#e1fff6'),27)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawPath($pen,$path)
  $pulse = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pulse.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(129,268),[System.Drawing.PointF]::new(205,268),[System.Drawing.PointF]::new(230,228),[System.Drawing.PointF]::new(265,296),[System.Drawing.PointF]::new(293,252),[System.Drawing.PointF]::new(380,252)))
  $pulsePen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#76e4ce'),22)
  $pulsePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pulsePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pulsePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($pulsePen,$pulse)
  $bitmap.Save((Join-Path $workspace ('public/icons/' + $entry[0])),[System.Drawing.Imaging.ImageFormat]::Png)
  $path.Dispose(); $pulse.Dispose(); $pen.Dispose(); $pulsePen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
