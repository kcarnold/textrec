#!/bin/bash
set -e
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."
OLD_CODE_ROOT=src/frontend/src/old_versions
TGT_REV_DIR=$1
REAL_REV=$2
target_dir="${OLD_CODE_ROOT:?}/${TGT_REV_DIR:?}"
if [ -d "$target_dir" ]; then
    echo "Not overwriting $target_dir"
else
    rm -rf "$target_dir"
    git archive "$REAL_REV" src/frontend | (mkdir "$target_dir" && cd "$target_dir" && tar x --strip-components=2)
fi
