#!/bin/bash
#SBATCH -J collect_relevance
#SBATCH -p serial_requeue
#SBATCH -n 1 # one core
#SBATCH -N 1 # on one node
#SBATCH -t 0-12:00
#SBATCH --mem 16000
#SBATCH -o collect_relevance_%A_%a.out
#SBATCH -e collect_relevance_%A_%a.err

PYTHON=~/.cache/pypoetry/virtualenvs/textrec-py3.6/bin/python

DATASET=${DATASET:-yelp}
TOTAL=${TOTAL:-$SLURM_ARRAY_TASK_COUNT}
CUR=${CUR:-$SLURM_ARRAY_TASK_ID}

BATCH_DATA=${CUR}/${TOTAL}
echo Batch $BATCH_DATA >&2

"${PYTHON}" scripts/example_eval_collect.py "$DATASET" 50:250:5 --subset=$BATCH_DATA
