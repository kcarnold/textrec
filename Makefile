.PHONY: clean lint requirements

#################################################################################
# GLOBALS                                                                       #
#################################################################################

PROJECT_DIR := $(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))
PROJECT_NAME = textrec

#################################################################################
# COMMANDS                                                                      #
#################################################################################

## Install Python Dependencies
requirements:
	poetry install
	poetry run python -c "import nltk; nltk.download('punkt'); nltk.download('perluniprops'); nltk.download('nonbreaking_prefixes')"

## Delete all compiled Python files
clean:
	find . -type f -name "*.py[co]" -delete
	find . -type d -name "__pycache__" -delete

## Lint using flake8
lint:
	flake8 src

#################################################################################
# PROJECT RULES                                                                 #
#################################################################################

## Train cueing models.
train_models:
	poetry run python scripts/train_cue_model.py wiki-book 128
	poetry run python scripts/train_cue_model.py wiki-film 128
	# poetry run python scripts/train_cue_model.py wiki-musician 128
	poetry run python scripts/train_cue_model.py wikivoyage 128
	# poetry run python scripts/train_cue_model.py newsroom 128
	# poetry run python scripts/train_cue_model.py yelp 128
	# poetry run python scripts/train_cue_model.py imdb 128
	#poetry run python scripts/train_cue_model.py bios 128

## Run backend Python server.
run_backend:
	poetry run python -m tornado.autoreload -m textrec.runserver

## Run frontend server (devel)
run_frontend:
	cd src/frontend && exec yarn start

## Deploy to server
deploy:
	poetry run fab deploy

## Retrieve logs from server.
get-data:
	poetry run fab get-data


qualify_workers:
	poetry run python scripts/backup_mturk.py
	poetry run python scripts/assign_qualification_to_workers.py


# Analyses

get-completed-participants:
	poetry run python scripts/get_completed_participants.py

data/analyzed/idea/%/step1.pkl: data/participants.txt src/textrec/analysis_step1.py
	poetry run python -m textrec.analysis_step1 $*

data/analyzed/idea/%/annotation_chunks.json: data/analyzed/idea/%/step1.pkl src/textrec/analysis_step2.py
	poetry run python -m textrec.analysis_step2 $*

HITs/chunk_indices_%.csv: data/analyzed/idea/%/annotation_chunks.json
	cd src/annotation/rate_texts/ && poetry run python build.py $* --truncate 2

# Automated analysis.
data/analyzed/idea/%/step3.pkl: data/analyzed/idea/%/step1.pkl src/textrec/analysis_step3.py
	poetry run python -m textrec.analysis_step3 $*


#################################################################################
# Self Documenting Commands                                                     #
#################################################################################

.DEFAULT_GOAL := show-help

# Inspired by <http://marmelab.com/blog/2016/02/29/auto-documented-makefile.html>
# sed script explained:
# /^##/:
# 	* save line in hold space
# 	* purge line
# 	* Loop:
# 		* append newline + line to hold space
# 		* go to next line
# 		* if line starts with doc comment, strip comment character off and loop
# 	* remove target prerequisites
# 	* append hold space (+ newline) to line
# 	* replace newline plus comments by `---`
# 	* print line
# Separate expressions are necessary because labels cannot be delimited by
# semicolon; see <http://stackoverflow.com/a/11799865/1968>
.PHONY: show-help
show-help:
	@echo "$$(tput bold)Available rules:$$(tput sgr0)"
	@echo
	@sed -n -e "/^## / { \
		h; \
		s/.*//; \
		:doc" \
		-e "H; \
		n; \
		s/^## //; \
		t doc" \
		-e "s/:.*//; \
		G; \
		s/\\n## /---/; \
		s/\\n/ /g; \
		p; \
	}" ${MAKEFILE_LIST} \
	| LC_ALL='C' sort --ignore-case \
	| awk -F '---' \
		-v ncol=$$(tput cols) \
		-v indent=19 \
		-v col_on="$$(tput setaf 6)" \
		-v col_off="$$(tput sgr0)" \
	'{ \
		printf "%s%*s%s ", col_on, -indent, $$1, col_off; \
		n = split($$2, words, " "); \
		line_length = ncol - indent; \
		for (i = 1; i <= n; i++) { \
			line_length -= length(words[i]) + 1; \
			if (line_length <= 0) { \
				line_length = ncol - indent - length(words[i]) - 1; \
				printf "\n%*s ", -indent, " "; \
			} \
			printf "%s ", words[i]; \
		} \
		printf "\n"; \
	}' \
	| more $(shell test $(shell uname) = Darwin && echo '--no-init --raw-control-chars')
