"""Validate the exported website against the frozen content and asset inventory."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urljoin, unquote
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        if self.tag in ('script', 'style'):
            return ''
        return ' '.join(' '.join(child.text() if isinstance(child, Node) else child for child in self.children).split())

    def has_class(self, cls):
        return cls in self.attrs.get('class', '').split()

    def find(self, predicate):
        return next((node for node in self.walk() if predicate(node)), None)


class Document(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.comments = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, value):
        self.stack[-1].children.append(value)

    def handle_comment(self, value):
        self.comments.append(value)

    def by_id(self, id):
        return self.root.find(lambda n: n.attrs.get('id') == id)

    def by_class(self, cls):
        return [n for n in self.root.walk() if n.has_class(cls)]


def text(html):
    return Document(html).root.text()


def validate(directory, repo=ROOT, default_version='v2'):
    out, repo = Path(directory).resolve(), Path(repo)
    inv = json.loads((repo/'.github/migration/inventory.json').read_text())
    content = json.loads((repo/'.github/migration/content.json').read_text())
    updates = json.loads((repo/'.github/migration/browser-feedback-content.json').read_text())
    mapping = {e['old']: '/'+e['new'] for e in inv['files'] if e['shared']}
    errors = []

    def check(condition, message):
        if not condition:
            errors.append(message)

    def normalized_url(value, original_page=None):
        if not original_page:
            return value
        resolved = urlsplit(urljoin('https://baseline.invalid/'+original_page, value))
        if resolved.netloc != 'baseline.invalid':
            return value
        return mapping.get(unquote(resolved.path.lstrip('/')), resolved.path) + ('?'+resolved.query if resolved.query else '') + ('#'+resolved.fragment if resolved.fragment else '')

    for item in inv['files']:
        p = out/item['new']
        check(p.is_file(), 'Missing migrated file: '+item['new'])
        if p.is_file():
            check(hashlib.sha256(p.read_bytes()).hexdigest() == item['migrated_sha256'], 'Changed baseline file: '+item['new'])
        if item['old'] not in ('index.html','publications/index.html','404.html','sitemap.xml'):
            alias = out/item['old']
            check(alias.is_file() and alias.read_bytes() == p.read_bytes(), 'Broken compatibility URL: '+item['old'])
    for name in ('index.html','publications/index.html','404.html'):
        check((out/name).read_bytes() == (out/default_version/name).read_bytes(), 'Root/version mismatch: '+name)
    for folder in ('cv','_common/cv'):
        check(sorted(p.name for p in (out/folder).iterdir()) == ['cv_en_latest.pdf','cv_zh_latest.pdf'], 'Private CV file exported: '+folder)
    for name in ('cv_en_latest.pdf','cv_zh_latest.pdf'):
        check((out/'cv'/name).read_bytes() == (out/'_common/cv'/name).read_bytes(), 'CV alias mismatch')
        check((out/'cv'/name).read_bytes().startswith(b'%PDF-'), 'Invalid public PDF')
    for path in out.rglob('*'):
        rel = path.relative_to(out)
        check(not any(p in ('.git','.github','notes','private.tex') for p in rel.parts), 'Private/development file exported: '+str(rel))
    home = Document((out/'v2/index.html').read_text())
    full = Document((out/'v2/publications/index.html').read_text())
    check(len(home.by_class('news-item')) == 13, 'Expected 13 visible news records')
    for node, original in zip(home.by_class('news-item'),content['news']):
        check(node.text() == text(original['date']+' '+original['html']), 'News text changed')
    check(home.by_class('bio-placeholder')[0].text() == text(content['bio']), 'Bio text changed')
    for key in ('education','experience'):
        for original in content[key]:
            node = home.by_id(original['id'])
            expected = text(original['title']+' '+original['date']+' '+original['body']+' '+original['description'])
            if original['id'] == 'pku-education':
                expected = re.sub(r'(GPA:.*?)(Research:.*?)(Advisor:)', lambda m: m[2].strip()+' '+m[1].strip()+' '+m[3], expected)
            check(node is not None and node.text().removesuffix(' Read more') == expected, key+' content changed: '+original['id'])
    # User's browser review explicitly removed Skills and replaced Location with a globe.
    check(home.by_id('skills') is None and home.by_id('location') is None, 'Removed sections returned')
    check(home.by_id('visitors') is not None and home.by_id('visitor-globe') is not None, 'Visitor map missing')
    check(home.by_id('news-toggle') is None, 'News must use scrolling, not an expand button')
    check(len(home.by_class('service-row')) == 3, 'Expected three reference-style service cards')
    cv = home.by_class('cv-links')
    about_copy = home.by_class('about-copy')[0]
    check(len(cv) == 1 and cv[0] in list(about_copy.walk()), 'CV links must be below the left biography')
    for key,id in [('Honors','honors')]:
        node = home.by_id(id)
        # Compare section contents after the heading, including all existing links/text.
        body = ' '.join(n.text() for n in node.children if isinstance(n,Node) and not n.has_class('section-heading'))
        check(body == text(content['extras'][key]), 'Section content changed: '+id)
    service_rows=home.by_class('service-copy')
    teaching=service_rows[0].find(lambda n:n.has_class('teaching-list'))
    expected_teaching=[f"{t['course']}, {t['term']}, {t['instructor']}, {t['background']}." for t in updates['teaching']]
    check(teaching is not None and [re.sub(r'\s+,', ',', n.text()) for n in teaching.children if isinstance(n,Node) and n.tag=='li']==expected_teaching, 'Teaching entries differ from approved course/term/instructor/background format')
    check(service_rows[1].text()=='Reviewer: '+', '.join(updates['reviewer']), 'Reviewer list differs from user update')
    invited=service_rows[2]
    invited_links=[n for n in invited.walk() if n.tag=='a']
    check(invited.text().startswith('Invited Talks:'), 'Invited Talks card missing')
    check([n.text() for n in invited_links]==['NOLO','MEgoHand','BAAI Conference 2023–2025'], 'Invited Talks labels differ from CV links')
    check([n.attrs['href'] for n in invited_links]==[
        'https://www.bilibili.com/video/BV14yCcBsErM?t=6.5',
        'https://www.bilibili.com/video/BV1uaCkBCEBZ?t=4.0',
        'https://www.bilibili.com/video/BV1YmsW6REQm/',
    ], 'Invited Talks destinations differ from CV links')
    original_friends=Document(content['extras']['Friends'])
    expected_friends=[(n.text(),n.attrs['href']) for n in original_friends.root.walk() if n.tag=='a']
    expected_friends.sort(key=lambda item:updates['friend_order'].index(item[0]))
    check([(n.text(),n.attrs['href']) for n in home.by_class('friend-link')]==expected_friends, 'Coauthor link labels or destinations changed')
    for doc,detail in [(home,False),(full,True)]:
        cards = doc.by_class('publication-card')
        check(len(cards)==19, 'Expected 19 publications')
        check(sum(n.attrs.get('data-selected')=='true' for n in cards)==8, 'Expected 8 selected publications')
        check({n.attrs['id'] for n in cards if n.attrs.get('data-selected')=='true'} == {'roboaware','fetch','groundingpi','bidexhd','megohand','nolo','cradle','stg'}, 'Selected membership changed')
        check({n.attrs['id'] for n in cards if n.attrs.get('data-first-author')=='true'} == {'roboaware','fetch','bidexhd','megohand','nolo','stg'}, 'First-author membership changed')
        for original in content['papers']:
            card = doc.by_id(original['id'])
            check(card is not None, 'Missing paper: '+original['id'])
            if card is None:continue
            title = card.find(lambda n:n.has_class('publication-title'))
            author = card.find(lambda n:n.has_class('publication-authors'))
            check(title.text()==original['title'], 'Paper title changed: '+original['id'])
            check(author.text()==text(original['author']), 'Paper authors changed: '+original['id'])
            original_author=Document(original['author'])
            check([n.attrs['href'] for n in author.walk() if n.tag=='a'] == [normalized_url(n.attrs['href'],'publications/index.html') for n in original_author.root.walk() if n.tag=='a'], 'Author links changed: '+original['id'])
            links = card.find(lambda n:n.has_class('publication-links'))
            actual=[n.attrs['href'] for n in links.walk() if n.tag=='a']
            expected=[normalized_url(a['url'],'publications/index.html') for a in original['links']]
            check(actual==expected, 'Paper resource links changed: '+original['id'])
            if detail:
                description=card.find(lambda n:n.has_class('publication-description'))
                check(description is not None and description.text()==text(original['summary']), 'Paper description changed: '+original['id'])
                venue=card.find(lambda n:n.has_class('publication-venue'))
                check(venue.text()==original['venue'],'Paper status changed: '+original['id'])
    check(len(full.by_class('publication-description'))==19, 'Expected 19 research descriptions')
    check([n.attrs['id'] for n in home.by_class('publication-card')]==content['home_order'], 'Homepage paper order changed')
    check([n.attrs['id'] for n in full.by_class('publication-card')]==[p['id'] for p in content['papers']], 'Publication-page paper order changed')
    for group in full.by_class('publication-group'):
        year=group.find(lambda n:n.has_class('publication-group-title')).text()
        check([n.attrs['id'] for n in group.walk() if n.has_class('publication-card')]==[p['id'] for p in content['papers'] if p['year']==year], 'Publication year grouping changed')
    active=[n.attrs['data-social'] for n in home.root.walk() if 'data-social' in n.attrs]
    check(active==['email','wechat','scholar','github','xiaohongshu','zhihu','openreview','linkedin','bilibili','douyin'], 'Social links/order differ from user request')
    config=json.loads((out/'v2/data/site.json').read_text())
    for item in config['social']:
        link=home.root.find(lambda n:n.attrs.get('data-social')==item['id'])
        if item['url'] and item['id'] != 'huggingface':
            check(link is not None and link.attrs.get('href')==item['url'], 'Static/config social link mismatch: '+item['id'])
    check(any('data-social="huggingface"' in c and 'https://huggingface.co/ZBH0' in c for c in home.comments), 'Hugging Face URL must remain in commented HTML')
    check(home.by_class('reviewer-copy')[0].find(lambda n:n.tag=='br') is not None, 'Reviewer title and venues must use two lines')
    for id in ('x','instagram','modelscope','huggingface'):
        check(any('data-social="'+id+'"' in c for c in home.comments),'Missing commented social entry: '+id)
    for name in ['v2/index.html','v2/publications/index.html','v2/404.html','v1/index.html','v1/publications/index.html']:
        doc=Document((out/name).read_text())
        if name.startswith('v2/'):
            check(not doc.by_class('design-credit'), 'Removed footer credit returned')
            nav=doc.by_id('nav-links')
            targets=[n.attrs.get('href','').split('#')[-1] for n in nav.walk() if n.tag=='a']
            check(targets==['about','news','publications','education','experience','honors','services','friends','visitors'],'Navigation does not match revised sections')
            check(doc.by_class('site-logo')[0].attrs['src']=='/_common/branding/logo.svg','Incorrect personal logo')
        ids=[n.attrs['id'] for n in doc.root.walk() if 'id' in n.attrs]
        check(not [id for id,c in Counter(ids).items() if c>1], 'Duplicate IDs: '+name)
        for node in doc.root.walk():
            for attr in ('src','href','poster'):
                value=node.attrs.get(attr)
                if not value:continue
                u=urlsplit(value)
                if u.scheme or u.netloc or not u.path:continue
                resolved=urlsplit(urljoin('https://local.invalid/'+name,value))
                target=out/unquote(resolved.path).lstrip('/')
                check(target.exists(), 'Missing local resource: '+name+' → '+value)
    for name in ['index.html','publications/index.html']:
        old=Document((out/'v1'/name).read_text());new=Document((out/'v2'/name).read_text())
        for key in ['description','keywords','author','google-site-verification']:
            before=old.root.find(lambda n:n.tag=='meta' and n.attrs.get('name')==key)
            after=new.root.find(lambda n:n.tag=='meta' and n.attrs.get('name')==key)
            check(before is not None and after is not None and before.attrs['content']==after.attrs['content'], 'SEO metadata changed: '+name+' '+key)
    for css in (out/'v2/assets/css').glob('*.css'):
        for value in re.findall(r'url\([\s\"\']*([^\)\"\']+)',css.read_text()):
            if value.startswith(('data:','http:','https:')):continue
            path=out/value.lstrip('/') if value.startswith('/') else css.parent/value
            check(path.exists(),'Missing CSS resource: '+value)
    check((out/'.nojekyll').is_file(),'Missing .nojekyll')
    visitor_config=(out/'v2/assets/js/visitor-config.js').read_text()
    deployment=json.loads((repo/'.github/visitor-worker/deployment-record.json').read_text())
    check("endpoint: '"+deployment['worker_url']+"/stats'" in visitor_config, 'Unexpected statistics endpoint')
    check("trackEndpoint: '"+deployment['worker_url']+"/visit'" in visitor_config, 'Unexpected tracking endpoint')
    check("allowedHosts: ['zhoubohan0.github.io']" in visitor_config, 'Production hostname restriction missing')
    check('fallbackSnapshot: undefined' in visitor_config and 'qize-visitor-map' not in visitor_config, 'Seeded or source-owner analytics data copied')
    if errors:
        raise AssertionError('\n'.join(errors))
    print('PASS: frozen v1/assets; 13 news; 19 papers/descriptions; 8 selected / 6 first-author; 10 active / 4 commented social links; Services, globe, CV and legacy URLs.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--default-version',choices=('v1','v2'),default='v2')
    args=parser.parse_args()
    validate(args.directory,default_version=args.default_version)
