#!/bin/bash
#SBATCH -J split_wiki
#SBATCH -p serial_requeue
#SBATCH -n 1 # one core
#SBATCH -N 1 # on one node
#SBATCH -t 0-6:00
#SBATCH --mem 1000
#SBATCH -o splitwiki_%A_%a.out
#SBATCH -e splitwiki_%A_%a.err

PYTHON=~/.cache/pypoetry/virtualenvs/textrec-py3.6/bin/python

target=~/Wikipedia/stream${SLURM_ARRAY_TASK_ID}.jsonl
rm -f "$target"

for page in ~/Wikipedia/enwiki-*multistream${SLURM_ARRAY_TASK_ID}.xml*.bz2; do
    echo $page
    bzcat "$page" | "${PYTHON}" scripts/split_wikis.py >> "$target"
done
