// ==UserScript==
// @name          Linkify bug comments (rt.perl.org)
// @namespace     [mauke]/rt.perl.org
// @description   turn commit references into clickable links
// @include       http://rt.perl.org/*
// @include       https://rt.perl.org/*
// ==/UserScript==

function process_ranges_under(root, predicate, body, kont) {
    if (predicate(root)) {
        let range = document.createRange();
        range.selectNode(root);
        return body(range, kont);
    }

    let queue = [root];

    let loop_tree = function loop_tree() {
        while (queue.length) {
            let node = queue.shift();
            if (node.nodeType !== node.ELEMENT_NODE) {
                continue;
            }

            let loop_children = function loop_children(p) {
                while (p) {
                    if (!predicate(p)) {
                        queue.push(p);
                        p = p.nextSibling;
                        continue;
                    }

                    let range = document.createRange();
                    range.setStartBefore(p);
                    while (p.nextSibling && predicate(p.nextSibling)) {
                        p = p.nextSibling;
                    }
                    range.setEndAfter(p);
                    p = p.nextSibling;
                    return body(range, function () {
                        return loop_children(p);
                    });
                }
                return loop_tree();
            };

            return loop_children(node.firstChild);
        }
        return kont();
    };
    return loop_tree();
}

function is_kinda_text(node) {
    return (
        node.nodeType === node.TEXT_NODE ||
        node.nodeType === node.ELEMENT_NODE && node.nodeName === 'BR'
    );
}

function replace_text_under(root, body, kont) {
    return process_ranges_under(
        root,
        is_kinda_text,
        function (range, kont_inner) {
            let synth = '';
            let frag = range.extractContents();
            for (let p = frag.firstChild; p; p = p.nextSibling) {
                synth += p.nodeType === p.TEXT_NODE ? p.nodeValue : '\0';
            }
            return body(synth, function (x) {
                range.insertNode(x);
                return kont_inner();
            });
        },
        kont
    );
}

function xpath(expr, doc) {
    doc = doc || document;
    return doc.evaluate(expr, doc, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
}

function autolink(text, kont_outer) {
    let re = /(?:\b(?:bug|fix\w*|perl))?[\0\s]+#(\d{3,})|(\b(?:(?:applied|patch)[\0\s]+(?:\w+[\0\s]+)*?as|by|commit|in|of|with)[\0\s]+)(?!default)([\da-f]{4,}(?:[\0\s]*(?:,|(?:,[\0\s]*)?(?:and|or)[\0\s])[\0\s]*[\da-f]{4,})*)|(applied[\0\s]+as[\0\s]+)(#\d{2,})/ig;
    //                                          [$1^^^^] [$2^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^]           [$3^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^] [$4^^^^^^^^^^^^^^^^^^^^^][$5^^^^^]

    let prev = 0;
    let frag = document.createDocumentFragment();

    function autotext_from(t, a, z) {
        let chunk = t.slice(a, z);
        let pieces = chunk.match(/[^\0]+|\0/g) || [];
        for (let i = 0; i < pieces.length; i++) {
            let p = pieces[i];
            let x = p === '\0'
                ? document.createElement('br')
                : document.createTextNode(p)
            ;
            frag.appendChild(x);
        }
    }

    function autotext(to) {
        autotext_from(text, prev, to);
    }

    function step(kont) {
        let m = re.exec(text);
        if (!m) {
            return kont();
        }
        autotext(m.index + (m[2] || m[4] || '').length);

        let link_url, link_text;
        let kont_local = function () {
            let a = document.createElement('a');
            a.href = link_url;
            a.appendChild(document.createTextNode(link_text));
            frag.appendChild(a);

            prev = re.lastIndex;
            return step(kont);
        };

        if (m[1]) {
            link_url = 'http://rt.perl.org/rt3/Public/Bug/Display.html?id=' + m[1];
            link_text = m[0];
        } else if (m[3]) {
            if (/^[\da-f]+$/i.test(m[3])) {
                link_url = 'http://perl5.git.perl.org/perl.git/commitdiff/' + m[3];
                link_text = m[3];
            } else {
                let t = m[3];
                let p = 0;
                let re2 = /\b[\da-f]+\b/ig;
                let m2;
                while ((m2 = re2.exec(t))) {
                    autotext_from(t, p, m2.index);
                    let a = document.createElement('a');
                    a.href = 'http://perl5.git.perl.org/perl.git/commitdiff/' + m2[0];
                    a.appendChild(document.createTextNode(m2[0]));
                    frag.appendChild(a);
                    p = re2.lastIndex;
                }
                autotext_from(t, p, t.length);
                prev = re.lastIndex;
                return step(kont);
            }
        } else {
            let srch = 'http://perl5.git.perl.org/perl.git?a=search&h=HEAD&st=commit&s=' + encodeURIComponent('@' + m[5].substr(1));
            return GM_xmlhttpRequest({
                method: 'GET',
                synchronous: false,
                url: srch,
                onreadystatechange: function (r) {
                    if (r.readyState !== 4) return;
                    link_text = m[5];
                    link_url = srch;
                    if (r.status === 200) {
                        let xml = r.responseXML || new DOMParser().parseFromString(r.responseText, 'text/xml');
                        //GM_log(JSON.stringify({status: r.status, xml: !!xml}));
                        if (xml) {
                            let results = xpath('//*[name()="table"][@class="commit_search"]//*[name()="tr"]/*[name()="td"][@class="link"]/*[name()="a"][text()="commitdiff"]', xml);
                            //GM_log(results + ' - ' + results.snapshotLength);
                            if (results && results.snapshotLength === 1) {
                                let base = (/^\w+:\/\/[^\/]+/.exec(r.finalUrl) || ['http://perl5.git.perl.org'])[0];
                                link_url = results.snapshotItem(0).href.replace(/^(?=\/)/, function () base);
                            }
                        }
                    }
                    return kont_local();
                },
            });
        }

        return kont_local();
    }

    step(function () {
        autotext(text.length);
        return kont_outer(frag);
    });
}

let roots = document.querySelectorAll('div.messagebody');
for (let i = 0; i < roots.length; i++) {
    let root = roots[i];
    replace_text_under(root, autolink, function () {});
}
