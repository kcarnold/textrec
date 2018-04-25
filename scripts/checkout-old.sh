#!/bin/bash
OLD_CODE_ROOT=src/frontend/src/old_versions
git archive $1 src/frontend | (mkdir $OLD_CODE_ROOT/$1 && cd $OLD_CODE_ROOT/$1 && tar x --strip-components=2)
