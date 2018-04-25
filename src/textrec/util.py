import joblib
from .paths import paths

mem = joblib.Memory(str(paths.cache), mmap_mode='r')
