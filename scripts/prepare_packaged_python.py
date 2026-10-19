import os
import sys
import shutil
import subprocess

def prepare_packaged_python():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_dir = os.path.join(repo_root, "python-runtime")
    venv_dir = os.path.join(repo_root, "backend", "venv")
    cfg_file = os.path.join(venv_dir, "pyvenv.cfg")

    if not os.path.exists(cfg_file):
        raise FileNotFoundError(f"pyvenv.cfg not found at {cfg_file}")

    home_dir = None
    with open(cfg_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("home ="):
                home_dir = line.split("=", 1)[1].strip()
                break

    if not home_dir or not os.path.exists(home_dir):
        # Fallback to current python sys.base_prefix
        home_dir = sys.base_prefix

    print(f"Base Python location: {home_dir}")
    print(f"Target bundled runtime: {target_dir}")

    # Check if target already prepared and working
    test_exe = os.path.join(target_dir, "python.exe")
    if os.path.exists(test_exe):
        try:
            res = subprocess.run([test_exe, "-c", "import fastapi, uvicorn; print('VALID')"], capture_output=True, text=True, timeout=10)
            if "VALID" in res.stdout:
                print("Existing python-runtime is valid and ready.")
                return target_dir
        except Exception:
            print("Existing python-runtime needs refresh...")

    os.makedirs(target_dir, exist_ok=True)

    # 1. Copy base root files (python.exe, dlls)
    for item in os.listdir(home_dir):
        src = os.path.join(home_dir, item)
        dst = os.path.join(target_dir, item)
        if os.path.isfile(src) and (item.lower().endswith((".exe", ".dll")) or item.lower() in ("license.txt", "news.txt")):
            if not os.path.exists(dst):
                shutil.copy2(src, dst)

    # 2. Copy DLLs directory
    dlls_src = os.path.join(home_dir, "DLLs")
    dlls_dst = os.path.join(target_dir, "DLLs")
    if os.path.exists(dlls_src) and not os.path.exists(dlls_dst):
        print("Copying standard DLLs...")
        shutil.copytree(dlls_src, dlls_dst)

    # 3. Copy Lib directory (standard library)
    lib_src = os.path.join(home_dir, "Lib")
    lib_dst = os.path.join(target_dir, "Lib")
    if os.path.exists(lib_src):
        os.makedirs(lib_dst, exist_ok=True)
        for item in os.listdir(lib_src):
            if item.lower() == "site-packages":
                continue
            src = os.path.join(lib_src, item)
            dst = os.path.join(lib_dst, item)
            if not os.path.exists(dst):
                if os.path.isdir(src):
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)

    # 4. Copy venv site-packages
    sp_src = os.path.join(venv_dir, "Lib", "site-packages")
    sp_dst = os.path.join(lib_dst, "site-packages")
    if os.path.exists(sp_src) and not os.path.exists(sp_dst):
        print("Copying venv site-packages (FastAPI, Torch, ChromaDB, EasyOCR)...")
        shutil.copytree(sp_src, sp_dst)

    # 5. Validate the runtime
    print("Validating bundled Python runtime...")
    cmd = [test_exe, "-c", "import fastapi, uvicorn, chromadb, app.main; print('Standalone Python runtime validated successfully!')"]
    proc = subprocess.run(cmd, cwd=os.path.join(repo_root, "backend"), capture_output=True, text=True)
    if proc.returncode == 0:
        print(proc.stdout.strip())
        return target_dir
    else:
        print("Validation output:")
        print(proc.stdout)
        print("Validation error:")
        print(proc.stderr)
        raise RuntimeError("Standalone Python runtime validation failed.")

if __name__ == "__main__":
    prepare_packaged_python()
