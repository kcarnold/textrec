from textrec.paths import paths

data = open(paths.gruntwork / 'for_pairwise_gc1.json').read()
with open('public/for_pairwise_gc1.js', 'w') as f:
    f.write('var DATA = ')
    f.write(data)
    f.write(';\n')
