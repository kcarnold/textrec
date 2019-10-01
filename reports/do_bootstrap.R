total_iterations <- 8

library(dplyr)
library(readr)
library(tidyverse)

# Modeling
library(lme4)
library(afex)
library("emmeans")
library("parallel")

afex::set_sum_contrasts()

## See vignette("afex_mixed_example") for why "asymptotic".
emm_options(lmer.df = "asymptotic") # also possible: 'satterthwaite', 'kenward-roger'
# emm_options(lmer.df="kenward-roger") # slower, but needed for post-hoc tests to make sense.

# We need to set the stimulus (image) columns to chars because they otherwise look like numbers.
allData <- read_csv(
  "../data/analyzed/combined_data.csv",
  col_types = cols(stimulus = col_character(),
                   stimulus_order = col_character())
)

stop_for_problems(allData)


allData$recsVisible <- allData$condition != "norecs"


# Use only the "Gated" study.
allData <- allData %>% subset(experiment == "gc1")


# Exclude bad participants.
data <-
  subset(allData, (participant != "pr5hff") &
           (participant != "7q253f"))


# Set appropriate columns as nominal factors
data <-
  data %>% mutate_at(
    c(
      'experiment',
      'block',
      'participant',
      'stimulus',
      'stimulus_order',
      'condition_order'
    ),
    factor
  )

#data$idx <- factor(data$idx)
#data$idx_in_block <- factor(data$idx_in_block)

data <- data %>% rename(num_predictable = corrected_bow_recs_idealuse_standard,
                        chars_per_sec = characters_per_sec)


# Name the conditions.
data <- data %>% mutate(condition = factor(
  recode_factor(
    condition,
    "norecs" = "Never",
    "gated" = "OnlyConfident",
    "standard" = "Always"
  ),
  levels = c("Never", "OnlyConfident", "Always")
))

# Compute derived data.
data <- data %>% mutate(chars_per_sec_log = log(chars_per_sec))

data$itpw <- data$corrected_tapstotype_standard / data$num_words
data$itpw_log <- log(data$itpw)
data$itpw_gated <- data$corrected_tapstotype_gated / data$num_words
data$mean_rarity <- 1 - (data$mean_log_freq / 7)
data$total_nll <- -data$logprob_unconditional * data$num_words
data$tapsPerSec <- data$num_taps / data$seconds_spent_typing
data$anyErrors <- factor(data$uncorrected_errors != 0)
data$anyADJ = factor(data$ADJ != 0)

#data$num_predictable = data$corrected_bow_recs_idealuse_standard
data$frac_predictable = data$num_predictable / data$num_words

#data$num_not_recced = data$corrected_bow_recs_offered_standard - data$corrected_bow_recs_idealuse_standard
#data$frac_not_recced = 1 - data$corrected_bow_recs_idealuse_standard / data$corrected_bow_recs_offered_standard

#data <- data %>% group_by(participant) %>% mutate(mean_relevant_use_frac=mean(relevant_use_frac, na.rm=T)) %>% ungroup()
#data$rec_use_bin <- factor(ntile(data$mean_relevant_use_frac, 2))

vars.to.summarize <- list(
  "num_words" = "Number of words written",
  "itpw" = "Ideal Taps per Word (ITPW)",
  "itpw_log" = "log(ITPW)",
  "itpw_gated" = "ITPW in Gated",
  "corrected_tapstotype_standard" = "Total taps to type",
  "num_chars" = "Number of characters",
  "num_colors" = "Number of colors used",
  "mean_rarity" = "Mean word rarity (inverse log frequency)",
  "total_rarity" = "Total rarity of words used",
  "total_nll" = "Total NLL under language model",
  "ADJ" = "Fraction of adjectives",
  "NOUN" = "Fraction of nouns",
  "pos_count_ADJ" = "Number of adjectives",
  "pos_count_NOUN" = "Number of nouns",
  "pos_count_VERB" = "Number of verbs",
  "num_predictable" = "Number of predictable words",
  "frac_predictable" = "Fraction of words that were predictable",
  "relevant_use_frac" = "Fraction of relevant predictions that were used",
  "chars_per_sec" = "Characters per Second",
  "tapsPerSec" = "Taps per Second",
  "TLX_sum" = "Total cognitive load (TLX)",
  "physical" = "Physical load (TLX)",
  "mental" = "Mental load (TLX)"
)

expLevel <- data %>%
  group_by(
    experiment,
    condition_order,
    participant,
    age,
    chars_per_sec_norecs_mean,
    steppedBack,
    gender,
    use_predictive
  ) %>%
  summarise(
    chars_per_sec_mean = mean(chars_per_sec),
    rec_use_per_seen_mean = mean(rec_use_per_seen, na.rm = TRUE)
  )

data <- left_join(data, expLevel, copy = TRUE)

print(paste("Total", n_distinct(allData$participant), "participants"))

# based on https://transparentstats.github.io/guidelines/effectsize.html#effectsize_exemplar_within
# Sample subjects, but keep all data for each.
getBootstrapSample <- function () {
  subjects <- unique(data$participant)
  sampled_subjects <-
    sample(subjects, length(subjects), replace = TRUE)
  get_data_for_subject <- function(i) {
    data %>%
      # extract that subject's data
      filter(participant == sampled_subjects[i]) %>%
      # give them a unique id
      mutate(participant = paste0(sampled_subjects[i], '_', i))
  }

  # Need bind_rows to concatenate the samples for each subject.
  lapply(1:length(sampled_subjects), get_data_for_subject) %>% bind_rows()
}


analyze_one_iteration <- function(measures) {
  sampled <- getBootstrapSample()

  lapply(measures, function(m) {
    paste0(m, " ~ condition + (1|participant) + (1|stimulus)") %>%
      as.formula() %>%
      lme4::lmer(data = sampled) %>%
      emmeans(specs = "condition") %>%
      pairs() %>%
      as.data.frame(infer = F) %>%
      select(contrast, estimate) %>%
      mutate(measure = m)
  }) %>% bind_rows()
}


#analyze_one_iteration()

analyze_n_iterations <- function(n_iterations, measures) {
  lapply(1:n_iterations, function(x)
    analyze_one_iteration(measures)) %>% bind_rows()
}


core_count <- detectCores()
cluster <- makeCluster(core_count)
clusterSetRNGStream(cluster, iseed = 0)


measures_to_analyze = c("num_predictable", "frac_predictable", "num_words")

clusterExport(
  cluster,
  varlist = c(
    "getBootstrapSample",
    "analyze_one_iteration",
    "analyze_n_iterations",
    "data"
  )
)
clusterCall(cluster, function() {
  library("tidyverse")
  library("lme4")
  library("emmeans")
  NULL
})


iterations_per_node <- ceiling(total_iterations / core_count)
system.time(boot_results <- parLapply(
  cluster,
  rep(iterations_per_node, core_count),
  analyze_n_iterations,
  rep(measures_to_analyze, core_count)
))


stopCluster(cluster);

saveRDS(boot_results, "bootstrap_results.rds");

