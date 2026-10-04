import json,sys
from PIL import Image,ImageDraw,ImageFont
p=sys.argv[1];data=json.load(open(p));cw,ch,pad=11,26,22
fonts=[ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',18,index=i) for i in (0,1)]
bg=(17,21,27);fg=(214,219,228)
im=Image.new('RGB',(data['cols']*cw+2*pad,data['rows']*ch+2*pad),bg);d=ImageDraw.Draw(im)
palette=[(0,0,0),(205,49,49),(13,188,121),(229,229,16),(36,114,200),(188,63,188),(17,168,205),(229,229,229),(102,102,102),(241,76,76),(35,209,139),(245,245,67),(59,142,234),(214,112,214),(41,184,219),(255,255,255)]
def color(mode,value,default):
 if mode==0x3000000:return ((value>>16)&255,(value>>8)&255,value&255)
 if mode in (0x1000000,0x2000000):
  if value<16:return palette[value]
  if value<232:
   n=value-16;a=[0,95,135,175,215,255];return(a[n//36],a[n//6%6],a[n%6])
  return (8+10*(value-232),)*3
 return default
for y,row in enumerate(data['grid']):
 for x,c in enumerate(row):
  if c.get('width')==0:continue
  f=color(c.get('fgMode',0),c.get('fg',0),fg);b=color(c.get('bgMode',0),c.get('bg',0),bg)
  if c.get('inverse'):f,b=b,f
  px,py=pad+x*cw,pad+y*ch
  if b!=bg:d.rectangle((px,py,px+cw*c.get('width',1)-1,py+ch-1),fill=b)
  d.text((px,py),c.get('text',''),font=fonts[bool(c.get('bold'))],fill=f)
im.save(p[:-5]+'.png')
