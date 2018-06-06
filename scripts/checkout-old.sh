#!/bin/bash
cd "$(dirname ${BASH_SOURCE[0]})/.."
OLD_CODE_ROOT=src/frontend/src/old_versions
TGT_REV_DIR=$1
REAL_REV=$2
rm -rf "$OLD_CODE_ROOT/$TGT_REV_DIR"
git archive $REAL_REV src/frontend | (mkdir $OLD_CODE_ROOT/$TGT_REV_DIR && cd $OLD_CODE_ROOT/$TGT_REV_DIR && tar x --strip-components=2)
