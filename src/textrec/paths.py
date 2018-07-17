import pathlib


class paths:
    module_dir = pathlib.Path(__file__).resolve().parent
    top_level = module_dir.parent.parent
    frontend = top_level / 'src' / 'frontend'
    ui = frontend / 'build'
    logdir = top_level / 'logs'
    data = top_level / 'data'
    analyzed = data / 'analyzed'
    gruntwork = data / 'gruntwork'

    figures = top_level / 'reports' / 'figures'

    cache = top_level / 'cache'
    models = top_level / 'models'
    scripts = top_level / 'scripts'

    imgdata_h5_subset = models / "feats_by_imgid.subset.h5"
    imgdata_h5_all = top_level / 'models-local' / 'feats_by_imgid.h5'
    imgdata_h5 = imgdata_h5_subset

    old_code = frontend / 'src' / 'old_versions'
