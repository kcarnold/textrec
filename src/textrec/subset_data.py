import h5py
import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('full_file')
    parser.add_argument('subset_file')
    parser.add_argument('subset_ids')
    opts = parser.parse_args()

    subset_ids = opts.subset_ids.split(',')
    with h5py.File(opts.full_file, 'r') as full, h5py.File(opts.subset_file, 'w') as subset:
        for idx in subset_ids:
            data = full[idx][:]
            dataset = subset.create_dataset(idx, data.shape, dtype=data.dtype)
            dataset[...] = data
