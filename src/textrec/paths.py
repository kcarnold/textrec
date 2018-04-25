import pathlib


class paths:
    module_dir = pathlib.Path(__file__).resolve().parent
    top_level = module_dir.parent.parent
    frontend = top_level / 'src' / 'frontend'
    ui = frontend / 'build'
    logdir = top_level / 'logs'
    data = top_level / 'data'

    cache = top_level / 'cache'
    models = top_level / 'models'
    scripts = top_level / 'scripts'

    imgdata_h5 = models / "feats_by_imgid.subset.h5"

    old_code = frontend / 'src' / 'old_versions'
