"""Inspect the unsigned iOS IPA produced by GitHub Actions.

Run: python qa/verify-ios-ipa.py qa/out/ios-ci/ipa/DezhouNight-unsigned.ipa
"""
from __future__ import annotations

import hashlib
import plistlib
import struct
import sys
import zipfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

path = Path(sys.argv[1] if len(sys.argv) > 1 else "qa/out/ios-ci/ipa/DezhouNight-unsigned.ipa")
data = path.read_bytes()
print(f"ipa={path} bytes={len(data)} sha256={hashlib.sha256(data).hexdigest()}")

with zipfile.ZipFile(path) as zf:
    names = zf.namelist()
    print(f"entries={len(names)}")
    for needle in ("Payload/DezhouNight.app/DezhouNight",
                   "Payload/DezhouNight.app/Info.plist",
                   "Payload/DezhouNight.app/Assets.car"):
        print(f"{needle}: {'present' if needle in names else 'MISSING'}")
    info = plistlib.loads(zf.read("Payload/DezhouNight.app/Info.plist"))
    for key in ("CFBundleIdentifier", "CFBundleDisplayName", "CFBundleShortVersionString",
                "CFBundleVersion", "MinimumOSVersion", "DZAppURL", "NSMicrophoneUsageDescription"):
        print(f"{key}={info.get(key)!r}")
    ats = info.get("NSAppTransportSecurity") or {}
    print(f"ATS NSAllowsArbitraryLoads={ats.get('NSAllowsArbitraryLoads')!r}")
    print(f"orientations={info.get('UISupportedInterfaceOrientations')!r}")
    print(f"launchScreen={info.get('UILaunchScreen')!r}")
    exe = zf.read("Payload/DezhouNight.app/DezhouNight")
    magic, cputype, cpusubtype, filetype = struct.unpack("<IIII", exe[:16])
    arch = {0x0100000C: "arm64", 0x0000000C: "arm", 0x01000007: "x86_64"}.get(cputype, hex(cputype))
    print(f"mach-o magic=0x{magic:08x} cpu={arch} subtype=0x{cpusubtype:x} filetype={filetype} size={len(exe)}")
    pngs = [n for n in names if n.endswith(".png") and "AppIcon" in n]
    print(f"app icon pngs={len(pngs)}")
    print(f"assets.car bytes={len(zf.read('Payload/DezhouNight.app/Assets.car')) if 'Payload/DezhouNight.app/Assets.car' in names else 0}")

assert info.get("CFBundleIdentifier") == "com.dezhounight.poker"
assert info.get("DZAppURL", "").startswith("http")
assert arch == "arm64"
print("IPA_STRUCTURE_OK")
