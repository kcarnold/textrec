#!/bin/bash
git archive $1 src/frontend | (mkdir old-code/$1 && cd old-code/$1 && tar x --strip-components=2)
