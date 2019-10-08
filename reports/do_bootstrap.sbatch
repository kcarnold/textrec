#!/bin/bash

#SBATCH -N 1
#SBATCH -c 16
#SBATCH -J bootstrap
#SBATCH -t 48:00

echo -n "Starting "
date
Rscript do_bootstrap.R "$@"
echo -n "Done! "
date
