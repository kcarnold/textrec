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
	python -c "import nltk; nltk.download('punkt'); nltk.download('perluniprops'); nltk.download('nonbreaking_prefixes')"

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

# Analyses
# This rule needs to go first or else the logs_to_csv rule will match a 'withmanual' :(
data/analyzed/trial_withmanual_%.csv: src/textrec/gruntwork.py data/analyzed/trial_%.csv data/gruntwork
	python -m textrec.gruntwork $*

data/analyzed/trial_%.csv: data/participants.txt src/textrec/logs_to_csv.py
	python -m textrec.logs_to_csv $*

data/analyzed/combined_data.csv: data/analyzed/trial_withmanual_gc1.csv data/analyzed/trial_withmanual_spec2.csv
	python scripts/merge_data_from_all_experiments.py



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
