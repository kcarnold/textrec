textrec
==============================

Experiments in recommending text for composition tasks.

Workflows
-----

### Train the model

(TODO: write up)

### Post writing task

1. Deploy code to production: `fab deploy`. Test on server.
2. Post HIT (HITs/2018-04-09.html).


### Qualify workers who completed the writing task

1. Download MTurk metadata: `scripts/backup_mturk.py`.
2. Run script on downloaded data: `scripts/find_invalid_workers.py`.


Approach for counterbalancing
----

Random assignment to condition ordering does not suffice to ensure adequate counterbalancing. So when a new participant connects, we assign them the condition ordering with the lowest expected number of completed trials given the assignments and completions so far. This expectation is a sum of indicators: 1 for any already-comple trial, and the probability of completion for any assigned-but-incomplete trial. We take the probability of completion of an incomplete trial to be 0.5.

This algorithm requires knowing, for each participant within the batch, what ordering they were assigned and whether or not they completed. We take the simplest possible approach for both of these: we read the ordering out of the login entry (the first line) of each log, and we create a new file ('{participant_id}.completed') for a participant who completed.



Ignore the below...



Project Organization
------------

    ├── LICENSE
    ├── Makefile           <- Makefile with commands like `make data` or `make train`
    ├── README.md          <- The top-level README for developers using this project.
    ├── data
    │   ├── external       <- Data from third party sources.
    │   ├── interim        <- Intermediate data that has been transformed.
    │   ├── processed      <- The final, canonical data sets for modeling.
    │   └── raw            <- The original, immutable data dump.
    │
    ├── docs               <- A default Sphinx project; see sphinx-doc.org for details
    │
    ├── models             <- Trained and serialized models, model predictions, or model summaries
    │
    ├── notebooks          <- Jupyter notebooks. Naming convention is a number (for ordering),
    │                         the creator's initials, and a short `-` delimited description, e.g.
    │                         `1.0-jqp-initial-data-exploration`.
    │
    ├── references         <- Data dictionaries, manuals, and all other explanatory materials.
    │
    ├── reports            <- Generated analysis as HTML, PDF, LaTeX, etc.
    │   └── figures        <- Generated graphics and figures to be used in reporting
    │
    ├── requirements.txt   <- The requirements file for reproducing the analysis environment, e.g.
    │                         generated with `pip freeze > requirements.txt`
    │
    ├── src                <- Source code for use in this project.
    │   ├── __init__.py    <- Makes src a Python module
    │   │
    │   ├── data           <- Scripts to download or generate data
    │   │   └── make_dataset.py
    │   │
    │   ├── features       <- Scripts to turn raw data into features for modeling
    │   │   └── build_features.py
    │   │
    │   ├── models         <- Scripts to train models and then use trained models to make
    │   │   │                 predictions
    │   │   ├── predict_model.py
    │   │   └── train_model.py
    │   │
    │   └── visualization  <- Scripts to create exploratory and results oriented visualizations
    │       └── visualize.py
    │
    └── tox.ini            <- tox file with settings for running tox; see tox.testrun.org


--------

<p><small>Project based on the <a target="_blank" href="https://drivendata.github.io/cookiecutter-data-science/">cookiecutter data science project template</a>. #cookiecutterdatascience</small></p>
