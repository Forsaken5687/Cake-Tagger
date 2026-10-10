"""Build the Windows starter and its multi-size icon using Windows .NET tools."""
import json
import os
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Vector geometry follows assets/logo.svg; no raster dependency is bundled.
ICON_RENDERER = r"""
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
class IconRenderer {
 static void Main(string[] args) {
  foreach(int size in new[]{16,24,32,48,64,128,256}) {
   using(var bitmap=new Bitmap(size,size,PixelFormat.Format32bppArgb))
   using(var g=Graphics.FromImage(bitmap)) {
    g.SmoothingMode=SmoothingMode.AntiAlias;
    g.ScaleTransform(size/64f,size/64f);
    using(var path=new GraphicsPath()) {
     path.AddArc(0,0,36,36,180,90);path.AddArc(28,0,36,36,270,90);
     path.AddArc(28,28,36,36,0,90);path.AddArc(0,28,36,36,90,90);path.CloseFigure();
     using(var brush=new SolidBrush(Color.FromArgb(28,28,28)))g.FillPath(brush,path);
    }
    using(var tag=new GraphicsPath()) {
     tag.AddLine(19,12,36,12);tag.AddBezier(36,12,37.59f,12,39.12f,12.63f,40.24f,13.76f);
     tag.AddLine(40.24f,13.76f,52.24f,25.76f);tag.AddBezier(52.24f,25.76f,54.58f,28.10f,54.58f,31.90f,52.24f,34.24f);
     tag.AddLine(52.24f,34.24f,34.24f,51.24f);tag.AddBezier(34.24f,51.24f,31.90f,53.58f,28.10f,53.58f,25.76f,51.24f);
     tag.AddLine(25.76f,51.24f,13.76f,39.24f);tag.AddBezier(13.76f,39.24f,12.63f,38.12f,12,36.59f,12,35);
     tag.AddLine(12,35,12,19);tag.AddBezier(12,19,12,15.13f,15.13f,12,19,12);tag.CloseFigure();
     g.FillPath(Brushes.White,tag);
    }
    using(var dark=new SolidBrush(Color.FromArgb(28,28,28)))g.FillEllipse(dark,18,18,8,8);
    using(var pen=new Pen(Color.FromArgb(254,44,85),5)) {
     pen.StartCap=pen.EndCap=LineCap.Round;pen.LineJoin=LineJoin.Round;
     g.DrawLines(pen,new[]{new PointF(27,34),new PointF(33,40),new PointF(44,28)});
     pen.Width=3;g.DrawLines(pen,new[]{new PointF(48,12),new PointF(53,12),new PointF(53,17)});
    }
    bitmap.Save(Path.Combine(args[0],size+".png"),ImageFormat.Png);
   }
  }
 }
}
"""

def build_launcher(root=ROOT):
    root = Path(root).resolve()
    compiler = (
        Path(os.environ.get("WINDIR", "C:/Windows"))
        / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    )
    if not compiler.is_file():
        raise RuntimeError(
            "The Windows .NET Framework C# compiler is required to build Cake-Tagger.exe"
        )
    (root / "work").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="launcher-build-", dir=root / "work") as folder:
        staging = Path(folder)
        renderer = staging / "icon.cs"
        renderer.write_text(ICON_RENDERER, encoding="utf-8")
        subprocess.run(
            [str(compiler), "/nologo", "/target:exe", "/reference:System.Drawing.dll",
             "/out:" + str(staging / "icon.exe"), str(renderer)],
            check=True,
        )
        subprocess.run(
            [str(staging / "icon.exe"), str(staging)],
            check=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        images = [
            (size, (staging / (str(size) + ".png")).read_bytes())
            for size in (16, 24, 32, 48, 64, 128, 256)
        ]
        icon = bytearray(struct.pack("<HHH", 0, 1, len(images)))
        offset = 6 + 16 * len(images)
        for size, data in images:
            icon.extend(struct.pack(
                "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset
            ))
            offset += len(data)
        icon.extend(b"".join(data for _, data in images))
        (staging / "logo.ico").write_bytes(icon)
        version = json.loads(
            (root / "extension/manifest.json").read_text(encoding="utf-8")
        )["version"]
        metadata = staging / "metadata.cs"
        metadata.write_text(
            'using System.Reflection;\n'
            '[assembly: AssemblyTitle("Cake Tagger")]\n'
            '[assembly: AssemblyProduct("Cake Tagger")]\n'
            '[assembly: AssemblyVersion("' + version + '.0")]\n',
            encoding="utf-8",
        )
        output = staging / "Cake-Tagger.exe"
        subprocess.run(
            [str(compiler), "/nologo", "/target:exe", "/platform:anycpu", "/optimize+",
             "/win32icon:" + str(staging / "logo.ico"), "/out:" + str(output),
             str(root / "src/client/launcher.cs"), str(metadata)],
            check=True,
        )
        (root / "Cake-Tagger.exe").write_bytes(output.read_bytes())
    return root / "Cake-Tagger.exe"


if __name__ == "__main__":
    print(build_launcher())
