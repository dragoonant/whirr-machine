import os; os.makedirs(os.environ.get("PH_DIR", os.path.join(os.environ.get("TEMP", "."), "ph")), exist_ok=True)
import os; os.chdir(os.environ.get("PH_DIR", os.path.join(os.environ.get("TEMP", "."), "ph")))
import json,urllib.request,os,sys
ids="brown_mud_leaves_01 leafy_grass mossy_cobblestone cobblestone_floor_08 grass_path_3 muddy_tracks burned_ground_01 mud_cracked_dry_03 snow_02 brown_mud dark_wooden_planks".split()
for i in ids:
    d=json.load(urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{i}",headers={'User-Agent':'x'})))
    for k,n in (('Diffuse','diff'),('nor_gl','nor'),('Rough','rough')):
        r=d[k]['2k']['jpg'];p=f"{i}_{n}.jpg"
        if not os.path.exists(p):
            urllib.request.urlretrieve(r['url'],p)
    print(i,flush=True)
