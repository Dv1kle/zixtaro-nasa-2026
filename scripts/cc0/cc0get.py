# Download the agreed CC0 batch from Poly Haven: each asset into its own new directory under <out>.
# python -I cc0get.py <out dir>
import json, os, sys, urllib.request

OUT = sys.argv[1]
UA = {'User-Agent': 'asset-fetch/1.0'}
HDRIS = ['industrial_sunset_puresky', 'evening_field']
MODELS = ['cement_bag', 'Barrel_01', 'old_tyre', 'wooden_crate_02', 'metal_jerrycan', 'concrete_road_barrier', 'rusted_spade_01']


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def save(path, url, size):
    # only ever inside the asset's own directory
    root = os.path.realpath(os.path.dirname(path))
    assert root.startswith(os.path.realpath(OUT)), path
    os.makedirs(root, exist_ok=True)
    data = get(url)
    assert url.startswith('https://dl.polyhaven.org/'), url
    if size and len(data) != size:
        raise SystemExit(f'size mismatch for {url}: {len(data)} != {size}')
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


total = 0
for i in HDRIS:
    f = json.loads(get('https://api.polyhaven.com/files/' + i))['hdri']['1k']['hdr']
    d = os.path.join(OUT, i)
    os.makedirs(d, exist_ok=False)
    n = save(os.path.join(d, i + '_1k.hdr'), f['url'], f.get('size'))
    total += n
    print(i, n)
for i in MODELS:
    g = json.loads(get('https://api.polyhaven.com/files/' + i))['gltf']['1k']['gltf']
    d = os.path.join(OUT, i)
    os.makedirs(d, exist_ok=False)
    n = save(os.path.join(d, i + '_1k.gltf'), g['url'], g.get('size'))
    for rel, inc in g.get('include', {}).items():
        rel = rel.replace('\\', '/')
        assert not rel.startswith('/') and '..' not in rel.split('/'), rel
        n += save(os.path.join(d, *rel.split('/')), inc['url'], inc.get('size'))
    total += n
    print(i, n, sorted(g.get('include', {}).keys()))
print('total', total, f'{total / 1048576:.1f} MB')
