import pandas as pd
import numpy as np

dataset_full = pd.read_csv("data/num_details_spec1.csv")


# Train/Test Split

images = dataset_full["image_id"].unique()

rs = np.random.RandomState(115338)

# ## We randomly select one image to be entirely in the test set.

test_image = rs.choice(images)
print("Test image is", test_image)

# ## For the remaining 8 images, we also select 3 captions to be entirely in the test set.

dataset_remaining = dataset_full[dataset_full.image_id != test_image]
assert dataset_remaining.image_id.value_counts().mean() == 24

num_test_caps = 3
num_train_caps = 24 - num_test_caps

dataset_train = (
    dataset_remaining.groupby("image_id", as_index=False)
    .apply(lambda group: group.sample(n=num_train_caps, random_state=rs))
    .reset_index(drop=True)
)

counts = dataset_train.image_id.value_counts()
assert len(counts) == 8
assert counts.mean() == 21

print(len(dataset_train), "training captions")

dataset_train.to_csv("num_details_training_set.csv", index=False)
