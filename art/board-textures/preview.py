import os
from PIL import Image
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','public','assets','terrain','boards')
S=300;im=Image.new('RGB',(S*5+6*8,S+16),(20,20,20))
for i,n in enumerate(['bog','ruins','village','wasteland','outpost']):
    im.paste(Image.open(os.path.join(B,n,'albedo.jpg')).resize((S,S),Image.LANCZOS),(8+i*(S+8),8))
for q in (85,75,65,55):
    im.convert("P",palette=Image.ADAPTIVE,colors=256).save(os.path.join(os.path.dirname(os.path.abspath(__file__)),"preview.png"),optimize=True)
    break
