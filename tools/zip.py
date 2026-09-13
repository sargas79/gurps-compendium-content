"""Zips a directory with POSIX separators in the entry names.

Windows' own Compress-Archive writes backslashes, which Foundry cannot read: the
module installs and then finds none of its own files. zipfile's write() normalises
separators, so this stays a few lines rather than a workaround.

Usage: python tools/zip.py <directory> <archive.zip>
"""

import os
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2

    source, archive = sys.argv[1], sys.argv[2]
    if not os.path.isdir(source):
        print(f"No such directory: {source}", file=sys.stderr)
        return 1

    count = 0
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(source):
            for name in sorted(files):
                path = os.path.join(root, name)
                entry = os.path.relpath(path, source).replace(os.sep, "/")
                zf.write(path, entry)
                count += 1

    size = os.path.getsize(archive) / (1024 * 1024)
    print(f"{archive}: {count} files, {size:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
