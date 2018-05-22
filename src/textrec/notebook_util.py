import toolz

from . import util
# from IPython.display import Image, HTML

images = util.get_coco_captions()
id2img = {img['cocoid']: img for img in images}
id2url = id2url = util.get_coco_id2url()

def show_images(indices):
    def img(idx):
        img = id2img[idx]
        captions = '\n'.join(
            '<div>{}</div>'.format(sent)
            for sent in toolz.pluck('raw', img['sentences'])
        )
        return '<div style="display: inline-block;"><div>{}/{}</div><img src="{}">{}</div>'.format(
            img['split'], img['cocoid'], id2url[img['cocoid']], captions)

    return '\n'.join(img(idx) for idx in indices)