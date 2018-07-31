import toolz

from . import util
# from IPython.display import Image, HTML

print("Loading COCO captions")
images = util.get_coco_captions()
images_by_split = toolz.groupby('split', images)
id2img = {img['cocoid']: img for img in images}
print("Loading COCO id2url")
id2url = util.get_coco_id2url()
print("Done")

def show_images(indices, show_captions=True, show_label=True, max_width=200):
    def img(idx):
        img = id2img[idx]
        if show_captions:
            captions = '\n'.join(
                '<div>{}</div>'.format(sent)
                for sent in toolz.pluck('raw', img['sentences'])
            )
        else:
            captions = ''
        label = '<div>{}/{}</div>'.format(img['split'], img['cocoid']) if show_label else ''
        return '<div style="display: inline-block;">{}<img src="{}" style="max-width: {}px">{}</div>'.format(
            label, id2url[img['cocoid']], max_width, captions)

    return '\n'.join(img(idx) for idx in indices)
    