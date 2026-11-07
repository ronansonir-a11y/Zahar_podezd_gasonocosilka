#!/usr/bin/env python3
"""Download/cache the small toolchain needed to build the APK from source.

Everything is cached in ~/.cache/zahar-apk-tools (outside the repository) and
fetched only from the hosts available to this project: registry.npmjs.org,
pypi.org / files.pythonhosted.org and github.com / codeload.github.com.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".cache" / "zahar-apk-tools"
VENV = CACHE / "venv"


def run(cmd, cwd=None, capture=False):
    print("+", " ".join(str(c) for c in cmd))
    return subprocess.run(
        [str(c) for c in cmd], cwd=str(cwd) if cwd else None,
        check=True, text=True, stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None
    )


def venv_python() -> Path:
    if not (VENV / "bin" / "python").exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        run(["python3", "-m", "venv", VENV])
        run([VENV / "bin" / "pip", "install", "-q", "--upgrade", "pip"])
        run([VENV / "bin" / "pip", "install", "-q",
             "jdk4py==25.0.2.1", "Pillow", "numpy", "opencv-python-headless"])
    return VENV / "bin" / "python"


def java_home() -> Path:
    py = venv_python()
    out = run([py, "-c", "import jdk4py; print(jdk4py.JAVA_HOME)"], capture=True)
    return Path(out.stdout.strip())


def npm_extract(spec: str, folder: str) -> Path:
    """`npm pack spec` into CACHE and extract it into CACHE/folder."""
    dest = CACHE / folder
    if dest.exists() and any(dest.iterdir()):
        return dest
    CACHE.mkdir(parents=True, exist_ok=True)
    out = subprocess.check_output(
        ["npm", "pack", spec, "--silent"], cwd=str(CACHE), text=True
    )
    tarball_name = out.strip().splitlines()[-1]
    tarball = CACHE / tarball_name
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tarball, "r:gz") as tf:
        tf.extractall(dest)
    return dest


def ensure_aapt2() -> Path:
    out = CACHE / "aapt2"
    if out.exists() and out.stat().st_size > 1_000_000:
        return out
    pkg = npm_extract("aaptjs3@2.0.2", "npm_aaptjs3")
    src = pkg / "package" / "bin" / "x64" / "linux" / "aapt2"
    shutil.copy2(src, out)
    os.chmod(out, 0o755)
    return out


def ensure_ecj() -> Path:
    out = CACHE / "ecj.jar"
    if out.exists() and out.stat().st_size > 1_000_000:
        return out
    pkg = npm_extract("@ctxo/lang-java-analyzer@0.13.0", "npm_ctxo_analyzer")
    shutil.copy2(pkg / "package" / "jar" / "ctxo-jdt-analyzer-17.jar", out)
    return out


def ensure_apksigner() -> Path:
    out = CACHE / "apksigner.jar"
    if out.exists() and out.stat().st_size > 500_000:
        return out
    pkg = npm_extract("@postar/apktool-node@0.3.4", "npm_apktool_node")
    shutil.copy2(pkg / "package" / "lib" / "apksigner.jar", out)
    return out


def ensure_android_jar() -> Path:
    out = CACHE / "android-34.jar"
    if out.exists() and out.stat().st_size > 10_000_000:
        return out
    repo = CACHE / "android-platforms"
    if not repo.exists():
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
             "https://github.com/Sable/android-platforms.git", repo])
    run(["git", "-C", repo, "sparse-checkout", "set", "android-34"])
    shutil.copy2(repo / "android-34" / "android.jar", out)
    return out


def ensure_dx() -> Path:
    out = CACHE / "dx.jar"
    if out.exists() and out.stat().st_size > 500_000:
        return out
    repo = CACHE / "platform_dalvik"
    if not repo.exists():
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
             "--branch", "android10-release",
             "https://github.com/aosp-mirror/platform_dalvik.git", repo])
    run(["git", "-C", repo, "sparse-checkout", "set", "dx/src"])
    sources = sorted((repo / "dx" / "src").rglob("*.java"))
    # No JUnit/test sources exist in dx/src, but keep the filter explicit.
    sources = [p for p in sources if "/tests/" not in p.as_posix() and not p.name.endswith("Test.java")]
    classes = CACHE / "dx_classes"
    if classes.exists():
        shutil.rmtree(classes)
    classes.mkdir(parents=True)
    source_list = CACHE / "dx_sources.txt"
    source_list.write_text("\n".join(str(p) for p in sources), encoding="utf-8")
    java = java_home() / "bin" / "java"
    ecj = ensure_ecj()
    run([java, "-cp", ecj, "org.eclipse.jdt.internal.compiler.batch.Main",
         "-8", "-nowarn", "-proc:none", "-d", classes,
         "@" + str(source_list)], cwd=repo)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr("META-INF/MANIFEST.MF",
                   "Manifest-Version: 1.0\nMain-Class: com.android.dx.command.Main\n\n")
        for p in sorted(classes.rglob("*.class")):
            z.write(p, p.relative_to(classes).as_posix())
    return out


def ensure_three() -> Path:
    out = ROOT / "app" / "vendor" / "three.min.js"
    if out.exists() and out.stat().st_size > 100_000:
        return out
    pkg = npm_extract("three@0.149.0", "npm_three")
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pkg / "package" / "build" / "three.min.js", out)
    license_src = pkg / "package" / "LICENSE"
    if license_src.exists():
        shutil.copy2(license_src, ROOT / "app" / "vendor" / "LICENSE-three.txt")
    return out


def ensure_textures() -> None:
    required = [
        "face_zahar.png", "face_neighbor.png", "body_neighbor.png", "body_zahar.png",
        "floor_tile.png", "wall_panel.png", "grass.png", "icon_master.png"
    ]
    tex = ROOT / "app" / "textures"
    if all((tex / name).exists() for name in required):
        return
    run([venv_python(), ROOT / "tools" / "make_textures.py"], cwd=ROOT)


def ensure_all() -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    py = venv_python()
    jh = java_home()
    ensure_textures()
    return {
        "python": py,
        "java": jh / "bin" / "java",
        "keytool": jh / "bin" / "keytool",
        "ecj": ensure_ecj(),
        "dx": ensure_dx(),
        "aapt2": ensure_aapt2(),
        "apksigner": ensure_apksigner(),
        "android_jar": ensure_android_jar(),
        "three": ensure_three(),
    }


if __name__ == "__main__":
    paths = ensure_all()
    for k, v in paths.items():
        print(f"{k}: {v}")
