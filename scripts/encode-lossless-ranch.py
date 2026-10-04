from pathlib import Path
from PIL import Image
import json, hashlib

root = Path(__file__).resolve().parents[1]
files = [root / "apps/web/public/ranch/scene/pasture.png",
         root / "apps/web/public/ranch/ui/ranch-tools-v1.png",
         *sorted((root / "apps/web/public/ranch/scene/soft").glob("*.png"))]
rows = []
for source in files:
    target = source.with_name(source.stem + ("" if source.stem.endswith("-v1") else "-v1") + ".webp")
    with Image.open(source) as original:
        original = original.convert("RGBA")
        original.save(target, "WEBP", lossless=True, method=6, exact=True)
        with Image.open(target) as decoded:
            decoded = decoded.convert("RGBA")
            assert decoded.size == original.size
            for before, after in zip(original.getdata(), decoded.getdata()):
                assert before[3] == after[3] and (before[3] == 0 or before == after), source.name
    rows.append({"source": str(source.relative_to(root)), "output": str(target.relative_to(root)),
                 "pngBytes": source.stat().st_size, "webpBytes": target.stat().st_size,
                 "visiblePixelsIdentical": True, "dimensions": list(original.size),
                 "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
(root / "docs/test-reports/20261004-ranch-lossless-webp.json").write_text(json.dumps(rows, indent=2) + "\n")
print(json.dumps({"files": len(rows), "pngBytes": sum(r["pngBytes"] for r in rows),
                  "webpBytes": sum(r["webpBytes"] for r in rows)}))
# Production v1 filenames are immutable. If source artwork changes, introduce a new version.
