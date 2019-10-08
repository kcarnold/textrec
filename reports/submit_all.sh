#!/bin/sh
mkdir -p task_results
mkdir -p logs

for task in tasks/*.rds; do
    name="${task#tasks/}"
    result="task_results/${name}"
    echo "$task -> $result"
    sbatch --output=logs/"$name"-%A.out --error=logs/"$name"-%A.err do_bootstrap.sbatch "$task" "$result"
done
