library("dplyr")
library("readr")
library("tidyverse")
library("parallel")
library("pbapply")


doAnalysisSetup <- function() {
  library("tidyverse")
  library("afex")
  library("emmeans")
  afex::set_sum_contrasts()

  emm_options(lmer.df = "asymptotic") # also possible: 'satterthwaite', 'kenward-roger'
  invisible()
};
doAnalysisSetup()

analyze_one_iteration <- function(measures, data) {
  # based on https://transparentstats.github.io/guidelines/effectsize.html#effectsize_exemplar_within
  # Sample subjects, but keep all data for each.
  getBootstrapSample <- function (data) {
    subjects <- unique(data$participant)
    sampled_subjects <- sample(subjects, length(subjects), replace = TRUE)
    get_data_for_subject <- function(i) {
      data %>%
        # extract that subject's data
        filter(participant == sampled_subjects[i]) %>%
        # give them a unique id
        mutate(participant = paste0(sampled_subjects[i], '_', i))
    };
    # Need bind_rows to concatenate the samples for each subject.
    lapply(1:length(sampled_subjects), get_data_for_subject) %>% bind_rows()
  };

  # Pull out pairwise comparisons in a standard format.
  pairs_to_stats <- function(emmgrid) {
    emmgrid %>%
      pairs() %>%
      as.data.frame(infer=F) %>%
      rename(statistic=contrast) %>%
      select(statistic, estimate) %>%
      mutate(statistic=as.character(statistic))
  };

  # Pull out marginal means in a standard format.
  emmeans_to_stats <- function(emmgrid) {
    emmgrid %>%
      as.data.frame(infer=F) %>%
      rename(statistic=condition, estimate=emmean) %>%
      select(statistic, estimate) %>%
      mutate(statistic=as.character(statistic))
  };

  # Make a single sample for all analyses
  sampled <- getBootstrapSample(data=data);

  # Run all the requested analyses.
  # The results will be in a standard format, so we can bind_rows them.
  lapply(measures, function(x) {
    # specs are (measure, rest of formula, name).
    # if name is unspecified, default it to 'measure'.
    f <- paste0(x[[1]], x[[2]])
    if (length(x) > 2) {
      m <- x[[3]]
    } else {
      m <- x[[1]]
    }

    # Run this analysis.
    f %>%
      as.formula() %>%
      lme4::lmer(data=sampled) %>%
      emmeans(specs="condition") %>%
      {list(
        means=emmeans_to_stats(.)
        , pairs=pairs_to_stats(.))} %>% bind_rows(.id="type") %>%
      mutate(measure=m, statistic=factor(statistic))
  }) %>% bind_rows()
}


# Command line: Rscript do_bootstrap.R infile outfile
args <- commandArgs(trailingOnly = TRUE)
taskFilename <- args[1]
outFilename <- args[2]

# Task file format: a list of name, data, and measures.
task <- readRDS(taskFilename)
data <- task$data
measures <- task$measures
total_iterations <- task$iterations

print(paste("Starting", task$name, "iterations:", total_iterations))

# Spin up the cluster.
core_count <- detectCores()
cluster <- makeCluster(core_count)
clusterSetRNGStream(cluster, iseed = 0)

# Set up cluster
clusterExport(
  cluster,
  varlist = c(
    "analyze_one_iteration",
    "data",
    "measures"
  )
)
clusterCall(cluster, doAnalysisSetup) %>% invisible()

# Run all analyses for all iterations.
pboptions(type="timer")
boot_results <- pbapply::pblapply(
  1:total_iterations,
  function(i) {
    analyze_one_iteration(measures=measures, data=data)
  },
  cl=cluster
) %>% bind_rows()

stopCluster(cluster);

saveRDS(boot_results, outFilename)
