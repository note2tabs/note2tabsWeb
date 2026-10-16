#!/usr/bin/env python3
"""Read-only sitemap SEO audit. Standard library only; no auth or indexing claims."""
import argparse,concurrent.futures,datetime,hashlib,json,re,time,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from html.parser import HTMLParser
class Page(HTMLParser):
 def __init__(self):
  super().__init__();self.lang='';self.title='';self.h1=[];self.meta={};self.canonical=[];self.alternates={};self.links=[];self.jsonld=[];self._tag=None;self._text=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='html':self.lang=a.get('lang','')
  if tag in ['title','h1'] or tag=='script' and a.get('type')=='application/ld+json':self._tag=tag;self._text=''
  if tag=='meta':self.meta[a.get('name',a.get('property',''))]=a.get('content','')
  if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href',''))
  if tag=='link' and a.get('rel')=='alternate' and a.get('hreflang'):self.alternates[a['hreflang']]=a.get('href','')
  if tag=='a' and a.get('href','').startswith('/'):self.links.append(a['href'])
 def handle_data(self,data):
  if self._tag:self._text+=data
 def handle_endtag(self,tag):
  if tag!=self._tag:return
  if tag=='title':self.title=self._text.strip()
  if tag=='h1':self.h1.append(self._text.strip())
  if tag=='script':self.jsonld.append(self._text)
  self._tag=None

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Note2Tabs-SEO-Audit/1.0 (read-only; sitemap URLs)'})
 with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.url,dict(r.headers),r.read().decode('utf-8')
def run(base,output,workers):
 status,_,_,xml=fetch(base+'/sitemap.xml');root=ET.fromstring(xml)
 entries=[]
 for node in root.findall('{*}url'):
  loc=node.find('{*}loc').text
  alts={n.attrib['hreflang']:n.attrib['href'] for n in node.findall('{*}link')}
  entries.append((loc,alts))
 urls={u for u,_ in entries}
 def check(entry):
  url,sitemapAlts=entry;issues=[];warnings=[]
  try:
   status,final,headers,html=fetch(url);p=Page();p.feed(html)
   if status!=200:issues.append('HTTP '+str(status))
   if final.rstrip('/')!=url.rstrip('/'):issues.append('sitemap redirects')
   if p.canonical!=[url]:issues.append('canonical does not match sitemap URL')
   for directive in [p.meta.get('robots',''),p.meta.get('googlebot',''),headers.get('X-Robots-Tag','')]:
    if re.search(r'noindex|none',directive,re.I):issues.append('sitemap URL blocks indexing')
   if not p.title:issues.append('missing title')
   if not p.meta.get('description','').strip():issues.append('missing description')
   if len(p.h1)!=1 or not p.h1[0]:issues.append('expected one nonempty H1')
   path=urllib.parse.urlparse(url).path;prefix=path.split('/')[1];locale={'pt-br':'pt-BR','zh-hans':'zh-Hans'}.get(prefix,prefix if prefix in ['es','ja','ko','pl','ar','fr','it'] else 'en')
   if p.lang!=locale:issues.append('HTML language mismatch')
   if p.alternates!=sitemapAlts:issues.append('HTML and sitemap language alternates differ')
   for lang,href in p.alternates.items():
    if href not in urls:issues.append('alternate outside canonical sitemap: '+lang)
   for raw in p.jsonld:
    try:json.loads(raw)
    except ValueError:issues.append('invalid JSON-LD')
   if len(p.title)>80:warnings.append('long title; inspect visual width')
   if len(p.meta.get('description',''))>220:warnings.append('long description; inspect snippet')
   if any(ord(c)==0xfffd for c in p.title+p.meta.get('description','')):issues.append('replacement character in metadata')
   return dict(url=url,status=status,locale=locale,title=p.title,description=p.meta.get('description',''),h1=p.h1,canonical=p.canonical,alternates=p.alternates,issues=issues,warnings=warnings)
  except Exception as e:return dict(url=url,issues=[type(e).__name__+': '+str(e)])
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:rows=list(pool.map(check,entries))
 # Every language cluster must link back to the same set of canonical alternates.
 lookup={r['url']:r for r in rows}
 for row in rows:
  for href in row.get('alternates',{}).values():
   other=lookup.get(href)
   if other and other.get('alternates')!=row['alternates']:row['issues'].append('nonreciprocal alternates: '+href)
 report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':base,'method':'Read-only public sitemap crawl; no claim of Google indexing. Checks final response, metadata, HTML language, canonical, robots, H1, JSON-LD and reciprocal HTML/sitemap language links.','sitemapSha256':hashlib.sha256(xml.encode()).hexdigest(),'urlCount':len(rows),'issueCount':sum(bool(r['issues']) for r in rows),'checks':rows}
 with open(output,'w') as f:json.dump(report,f,indent=2,ensure_ascii=False);f.write('\n')
 print(json.dumps({'pages':len(rows),'issues':[(r['url'],r['issues']) for r in rows if r['issues']],'warnings':sum(bool(r.get('warnings')) for r in rows)},ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--base',default='https://www.note2tabs.com');p.add_argument('--output',required=True);p.add_argument('--workers',type=int,default=4);a=p.parse_args();run(a.base.rstrip('/'),a.output,a.workers)
