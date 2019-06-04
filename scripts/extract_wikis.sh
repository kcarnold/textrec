#!/bin/bash
#SBATCH -J extract_wiki
#SBATCH -p serial_requeue
#SBATCH -n 1 # one core
#SBATCH -N 1 # on one node
#SBATCH -t 0-6:00
#SBATCH --mem 1000
#SBATCH -o extract_wiki_%A_%a.out
#SBATCH -e extract_wiki_%A_%a.err

source activate textrec
PYTHON=~/.cache/pypoetry/virtualenvs/textrec-py3.6/bin/python

"${PYTHON}" scripts/extract_wikipedia_texts.py --stream_glob="/n/home10/kcarnold/scratch/Wikipedia-proc/stream\*.jsonl.gz" --outdir by_infobox --desired_categories="settlement,musical artist,company,film,book,television"
