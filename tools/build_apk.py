#!/usr/bin/env python3
"""Build dist/ZaharPodiezdMower.apk from the HTML5 game + minimal Java shell.

Usage:
    python3 tools/build_apk.py

The first run downloads a small toolchain into ~/.cache/zahar-apk-tools.
Intermediate files live in build/ (gitignored); only the signed APK is kept in
dist/.  The APK is signed with a locally generated *debug* key.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import setup_tools

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build" / "apk"
DIST = ROOT / "dist"
JAVA_SRC = ROOT / "android" / "src" / "com" / "arena" / "zahar" / "mower" / "MainActivity.java"
MANIFEST = ROOT / "android" / "AndroidManifest.xml"
RES = ROOT / "android" / "res"
ASSETS = ROOT / "app"
FINAL_APK = DIST / "ZaharPodiezdMower.apk"


def run(cmd, cwd=None, capture=False):
    print("+", " ".join(str(c) for c in cmd))
    return subprocess.run(
        [str(c) for c in cmd], cwd=str(cwd) if cwd else None,
        check=True, text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None
    )


def main() -> None:
    tools = setup_tools.ensure_all()
    BUILD.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(parents=True, exist_ok=True)

    classes = BUILD / "classes"
    flats = BUILD / "res_flat"
    shutil.rmtree(classes, ignore_errors=True)
    shutil.rmtree(flats, ignore_errors=True)
    classes.mkdir(parents=True)
    flats.mkdir(parents=True)

    # 1) Java -> .class (ECJ 3.39 with the Android 34 stubs).
    run([
        tools["java"], "-cp", tools["ecj"],
        "org.eclipse.jdt.internal.compiler.batch.Main",
        "-8", "-nowarn", "-proc:none",
        "-bootclasspath", tools["android_jar"],
        "-classpath", tools["android_jar"],
        "-d", classes, JAVA_SRC
    ])
    class_file = classes / "com" / "arena" / "zahar" / "mower" / "MainActivity.class"
    if not class_file.exists():
        raise RuntimeError("MainActivity.class was not produced")

    # 2) .class -> classes.dex (DX from the AOSP platform_dalvik source).
    dex = BUILD / "classes.dex"
    if dex.exists():
        dex.unlink()
    run([
        tools["java"], "-cp", tools["dx"], "com.android.dx.command.Main",
        "--dex", "--output=" + str(dex),
        "com/arena/zahar/mower/MainActivity.class"
    ], cwd=classes)
    if not dex.exists() or dex.stat().st_size < 500:
        raise RuntimeError("classes.dex was not produced")

    # 3) Compile resources and link an APK containing assets/ from app/.
    run([tools["aapt2"], "compile", "--dir", RES, "-o", flats])
    flat_files = sorted(flats.glob("*.flat"))
    if not flat_files:
        raise RuntimeError("aapt2 produced no compiled resources")
    unsigned = BUILD / "unsigned.apk"
    if unsigned.exists():
        unsigned.unlink()
    run([
        tools["aapt2"], "link", "-o", unsigned,
        "-I", tools["android_jar"],
        "--manifest", MANIFEST,
        "-A", ASSETS,
        "--auto-add-overlay",
        "--min-sdk-version", "24",
        "--target-sdk-version", "34",
        "--version-code", "1",
        "--version-name", "1.0",
    ] + flat_files)

    # 4) Add the DEX at the APK root.  aapt2 already aligned resources.arsc.
    with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(dex, "classes.dex")

    # 5) Create a local debug signing key if needed.
    keystore = BUILD / "debug.p12"
    if not keystore.exists():
        run([
            tools["keytool"], "-genkeypair",
            "-alias", "zahar",
            "-keystore", keystore,
            "-storetype", "PKCS12",
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-storepass", "android",
            "-keypass", "android",
            "-dname", "CN=Zahar Mower Debug, OU=Arena, O=Arena, L=Frankfurt, ST=Hesse, C=DE",
            "-noprompt"
        ])

    # 6) Official Android apksigner: v1 + v2 + v3 signatures.
    if FINAL_APK.exists():
        FINAL_APK.unlink()
    idsig = Path(str(FINAL_APK) + ".idsig")
    if idsig.exists():
        idsig.unlink()
    run([
        tools["java"], "-cp", tools["apksigner"],
        "com.android.apksigner.ApkSignerTool", "sign",
        "--in", unsigned,
        "--out", FINAL_APK,
        "--ks", keystore,
        "--ks-type", "PKCS12",
        "--ks-pass", "pass:android",
        "--key-pass", "pass:android",
        "--v1-signing-enabled", "true",
        "--v2-signing-enabled", "true",
        "--v3-signing-enabled", "true",
        "--v4-signing-enabled", "false",
        "--min-sdk-version", "24",
        "--verbose"
    ])

    idsig = Path(str(FINAL_APK) + ".idsig")
    if idsig.exists():
        idsig.unlink()

    # 7) Sanity checks: ZIP integrity, signatures, manifest badging.
    with zipfile.ZipFile(FINAL_APK) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError("Corrupt ZIP entry: " + bad)
        names = set(z.namelist())
        required = {"AndroidManifest.xml", "classes.dex", "resources.arsc",
                    "assets/index.html", "assets/game.js", "assets/vendor/three.min.js",
                    "assets/textures/face_zahar.png"}
        missing = sorted(required - names)
        if missing:
            raise RuntimeError("APK is missing: " + ", ".join(missing))

    verify = run([
        tools["java"], "-cp", tools["apksigner"],
        "com.android.apksigner.ApkSignerTool", "verify",
        "--verbose", "--print-certs", "--min-sdk-version", "24", FINAL_APK
    ], capture=True)
    print(verify.stdout.strip())
    if "Verified using v2 scheme (APK Signature Scheme v2): true" not in verify.stdout:
        raise RuntimeError("APK v2 signature verification failed")

    badging = run([tools["aapt2"], "dump", "badging", FINAL_APK], capture=True)
    print(badging.stdout.strip()[:1800])
    if "com.arena.zahar.mower" not in badging.stdout:
        raise RuntimeError("APK manifest package is wrong")

    print("\nAPK ready:", FINAL_APK)
    print("Size:", FINAL_APK.stat().st_size, "bytes")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(e.stdout or "", file=sys.stderr)
        print("Build failed with exit code", e.returncode, file=sys.stderr)
        sys.exit(e.returncode)
