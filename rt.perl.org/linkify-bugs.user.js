// ==UserScript==
// @name          Linkify bug comments (rt.perl.org)
// @namespace     [mauke]/rt.perl.org
// @description   turn commit references into clickable links
// @include       http://rt.perl.org/*
// @include       https://rt.perl.org/*
// ==/UserScript==

function xpath(expr, doc) {
	doc = doc || document;
	return doc.evaluate(expr, doc, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
}

let ts = xpath('//div[@class="messagebody"]//text()');

for (let i = 0; i < ts.snapshotLength; ++i) {
	let t = ts.snapshotItem(i);
	let text = t.nodeValue;
	GM_log(text.toSource());
	let prev = 0;
	let frag = document.createDocumentFragment();
	let re = /(?:\b(?:bug|fix\w*|perl))?\s+#(\d{3,})|(?:(\b(?:(?:applied|patch)\s+(?:\w+\s+)*?as|in|by)\s+)|(commit\s*))(?!default)([\da-f]{4,}(?:\s*(?:,|(?:,\s*)?(?:and|or)\s)\s*[\da-f]{4,})*)|(applied\s+as\s+)(#\d{2,})/ig;
	//                                      [$1^^^^]    [$2^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^] [$3^^^^^^^] [$4^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^] [$5^^^^^^^^^^^^^][$6^^^^^]
	function step(kont) {
		let m = re.exec(text);
		if (!m) {
			return kont();
		}
		let pre = text.slice(prev, m.index + (m[2] || m[5] || '').length);
		if (pre !== '') {
			frag.appendChild(document.createTextNode(pre));
		}

		let link_url, link_text;
		let local_kont = function () {
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
		} else if (m[4]) {
			if (/^[\da-f]+$/i.test(m[4])) {
				link_url = 'http://perl5.git.perl.org/perl.git/commitdiff/' + m[4];
				link_text = (m[3] || '') + m[4];
			} else {
				let t = (m[3] || '') + m[4];
				let p = 0;
				let re2 = /\b[\da-f]+\b/ig;
				let m2;
				while ((m2 = re2.exec(t))) {
					let tg = t.slice(p, m2.index);
					if (tg !== '') {
						frag.appendChild(document.createTextNode(tg));
					}
					let a = document.createElement('a');
					a.href = 'http://perl5.git.perl.org/perl.git/commitdiff/' + m2[0];
					a.appendChild(document.createTextNode(m2[0]));
					frag.appendChild(a);
					p = re2.lastIndex;
				}
				let tg = t.slice(p);
				if (tg !== '') {
					frag.appendChild(document.createTextNode(tg));
				}
				prev = re.lastIndex;
				return step(kont);
			}
		} else {
			let srch = 'http://perl5.git.perl.org/perl.git?a=search&h=HEAD&st=commit&s=' + encodeURIComponent('@' + m[6].substr(1));
			return GM_xmlhttpRequest({
				method: 'GET',
				synchronous: false,
				url: srch,
				onreadystatechange: function (r) {
					if (r.readyState !== 4) return;
					link_text = m[6];
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
					return local_kont();
				},
			});
		}
		return local_kont();
	}
	step(function () {
		let fin = text.slice(prev);
		if (fin !== '') {
			frag.appendChild(document.createTextNode(fin));
		}

		let p = t.parentNode;
		//p.insertBefore(frag, t.nextSibling);
		//p.removeChild(t);
		p.replaceChild(frag, t);
	});
	// while ((m = re.exec(text))) {
	// 	let pre = text.slice(prev, m.index + (m[2] || m[5] || '').length);
	// 	if (pre !== '') {
	// 		frag.appendChild(document.createTextNode(pre));
	// 	}

	// 	let a = document.createElement('a');
	// 	if (m[1]) {
	// 		a.href = 'http://rt.perl.org/rt3/Public/Bug/Display.html?id=' + m[1];
	// 		a.appendChild(document.createTextNode(m[0]));
	// 	} else if (m[4]) {
	// 		a.href = 'http://perl5.git.perl.org/perl.git/commitdiff/' + m[4];
	// 		a.appendChild(document.createTextNode((m[3] || '') + m[4]));
	// 	} else {
	// 		let srch = 'http://perl5.git.perl.org/perl.git?a=search&h=HEAD&st=commit&s=' + encodeURIComponent('@' + m[6].substr(1));
	// 		a.href = url;
	// 		a.appendChild(document.createTextNode(m[6]));
	// 	}
	// 	frag.appendChild(a);

	// 	prev = re.lastIndex;
	// }
	// if (!frag.hasChildNodes()) {
	// 	continue;
	// }
	// let fin = text.slice(prev);
	// if (fin !== '') {
	// 	frag.appendChild(document.createTextNode(fin));
	// }

	// let p = t.parentNode;
	// //p.insertBefore(frag, t.nextSibling);
	// //p.removeChild(t);
	// p.replaceChild(frag, t);
}
