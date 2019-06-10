textrec
==============================

Experiments in recommending text for composition tasks.

Workflows
-----

### Train the model

(TODO: write up)

### See what tasks look like:

Demos:
* http://mbp-zt.megacomplete.net:3000/?idx

### Post writing task

1. Deploy code to production: `make deploy`. Test on server.
2. Post HIT (HITs/2018-04-09.html).

### Run analysis

1. `make get-data`
2. `make get-completed-participants`
3. `make data/analyzed/trial_cueX.csv`


### Qualify workers who completed the writing task

1. Download MTurk metadata: `scripts/backup_mturk.py`.
2. Run script on downloaded data: `scripts/assign_qualification_to_workers.py`.

TODO: update this for the cue writing tasks.

### Make a hotfix for analysis of a deployed frontend build

1. Make a new branch from the frontend commit (git_rev in the "init" request):
   `git branch tmp $frontend_commit`
2. Make the hotfix there (perhaps by cherry-picking or copying from master).
3. Note the current hash.
4. Checkout master, edit analysis_util.py to add an entry to `rev_overrides`
   mapping frontend commit to the hash just recorded in #3.
5. Incorporate the hotfix commit into the git history: `git merge -s ours tmp`.

You can use a worktree to make this easier;
* `git worktree add tmp-worktere -b tmp $frontend_commit`
* then when you're done: `git worktree remove tmp-worktree`.

# Approach for counterbalancing

Random assignment to condition ordering does not suffice to ensure adequate counterbalancing. So when a new participant connects, we assign them the condition ordering with the lowest expected number of completed trials given the assignments and completions so far. This expectation is a sum of indicators: 1 for any already-comple trial, and the probability of completion for any assigned-but-incomplete trial. We take the probability of completion of an incomplete trial to be 0.5.

This algorithm requires knowing, for each participant within the batch, what ordering they were assigned and whether or not they completed. We take the simplest possible approach for both of these: we read the ordering out of the login entry (the first line) of each log, and we create a new file ('{participant_id}.completed') for a participant who completed.


--------

<p><small>Project based on the <a target="_blank" href="https://drivendata.github.io/cookiecutter-data-science/">cookiecutter data science project template</a>. #cookiecutterdatascience</small></p>
