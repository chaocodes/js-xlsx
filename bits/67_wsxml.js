function parse_ws_xml_dim(ws, s) {
	var d = safe_decode_range(s);
	if(d.s.r<=d.e.r && d.s.c<=d.e.c && d.s.r>=0 && d.e.r>=0) ws["!ref"] = encode_range(d);
}
var mergecregex = /<mergeCell ref="[A-Z0-9:]+"\s*\/>/g;
var sheetdataregex = /<(?:\w+:)?sheetData>([^\u2603]*)<\/(?:\w+:)?sheetData>/;
var hlinkregex = /<hyperlink[^>]*\/>/g;
/* 18.3 Worksheets */
function parse_ws_xml(data, opts, rels) {
	if(!data) return data;
	/* 18.3.1.99 worksheet CT_Worksheet */
	var s = {};

	/* 18.3.1.35 dimension CT_SheetDimension ? */
	var ridx = data.indexOf("<dimension");
	if(ridx > 0) {
		var ref = data.substr(ridx,50).match(/"(\w*:\w*)"/);
		if(ref != null) parse_ws_xml_dim(s, ref[1]);
	}

	/* 18.3.1.55 mergeCells CT_MergeCells */
	var mergecells = [];
	if(data.indexOf("</mergeCells>")!==-1) {
		var merges = data.match(mergecregex);
		for(ridx = 0; ridx != merges.length; ++ridx)
			mergecells[ridx] = safe_decode_range(merges[ridx].substr(merges[ridx].indexOf("\"")+1));
	}

	/* 18.3.1.17 cols CT_Cols */
	var columns = [];
	if(opts.cellStyles && data.indexOf("</cols>")!==-1) {
		/* 18.3.1.13 col CT_Col */
		var cols = data.match(/<col[^>]*\/>/g);
		parse_ws_xml_cols(columns, cols);
	}

	var refguess = {s: {r:1000000, c:1000000}, e: {r:0, c:0} };

	/* 18.3.1.80 sheetData CT_SheetData ? */
	var mtch=data.match(sheetdataregex);
	if(mtch) parse_ws_xml_data(mtch[1], s, opts, refguess);

	/* 18.3.1.48 hyperlinks CT_Hyperlinks */
	if(data.indexOf("</hyperlinks>")!==-1) parse_ws_xml_hlinks(s, data.match(hlinkregex), rels);

	if(!s["!ref"] && refguess.e.c >= refguess.s.c && refguess.e.r >= refguess.s.r) s["!ref"] = encode_range(refguess);
	if(opts.sheetRows > 0 && s["!ref"]) {
		var tmpref = safe_decode_range(s["!ref"]);
		if(opts.sheetRows < +tmpref.e.r) {
			tmpref.e.r = opts.sheetRows - 1;
			if(tmpref.e.r > refguess.e.r) tmpref.e.r = refguess.e.r;
			if(tmpref.e.r < tmpref.s.r) tmpref.s.r = tmpref.e.r;
			if(tmpref.e.c > refguess.e.c) tmpref.e.c = refguess.e.c;
			if(tmpref.e.c < tmpref.s.c) tmpref.s.c = tmpref.e.c;
			s["!fullref"] = s["!ref"];
			s["!ref"] = encode_range(tmpref);
		}
	}
	if(mergecells.length > 0) s["!merges"] = mergecells;
	if(columns.length > 0) s["!cols"] = columns;
	return s;
}


function parse_ws_xml_hlinks(s, data, rels) {
	for(var i = 0; i != data.length; ++i) {
		var val = parsexmltag(data[i], true);
		if(!val.ref) return;
		var rel = rels['!id'][val.id];
		if(rel) {
			val.Target = rel.Target;
			if(val.location) val.Target += "#"+val.location;
			val.Rel = rel;
		}
		var rng = safe_decode_range(val.ref);
		for(var R=rng.s.r;R<=rng.e.r;++R) for(var C=rng.s.c;C<=rng.e.c;++C) {
			var addr = encode_cell({c:C,r:R});
			if(!s[addr]) s[addr] = {t:"str",v:undefined};
			s[addr].l = val;
		}
	}
}

function parse_ws_xml_cols(columns, cols) {
	var seencol = false;
	for(var coli = 0; coli != cols.length; ++coli) {
		var coll = parsexmltag(cols[coli], true);
		var colm=parseInt(coll.min, 10)-1, colM=parseInt(coll.max,10)-1;
		delete coll.min; delete coll.max;
		if(!seencol && coll.width) { seencol = true; find_mdw(+coll.width, coll); }
		if(coll.width) {
			coll.wpx = width2px(+coll.width);
			coll.wch = px2char(coll.wpx);
			coll.MDW = MDW;
		}
		while(colm <= colM) columns[colm++] = coll;
	}
}

function write_ws_xml_cols(ws, cols) {
	var o = ["<cols>"], col, width;
	for(var i = 0; i != cols.length; ++i) {
		if(!(col = cols[i])) continue;
		var p = {min:i+1,max:i+1};
		/* wch (chars), wpx (pixels) */
		width = -1;
		if(col.wpx) width = px2char(col.wpx);
		else if(col.wch) width = col.wch;
		if(width > -1) { p.width = char2width(width); p.customWidth= 1; }
		o[o.length] = (writextag('col', null, p));
	}
	o[o.length] = "</cols>";
	return o.join("");
}

function write_ws_xml_cf(ws, opts, cf) {
	var o = [], p;
	for(var i = 0; i != cf.length; ++i) {
		p = {};
		var f = writextag('formula', escapexml(cf[i].f));
		p.type = "expression"; p.priority = "1"; // Hard-coded for now...
		if(cf[i].dxf) p.dfxId = get_dxf(opts.dxfs, cf[i]);
		var r = writextag('cfRule', f, {type:"expression", dxfId:get_dxf(opts.dxfs, cf[i]), priority:"1"});
		o[o.length] = writextag('conditionalFormatting', r, {sqref:cf[i].r});
	}
	return o.join("");
}

function write_ws_xml_cell(cell, ref, ws, opts, idx, wb) {
	if(cell.v === undefined) return "";
	var vv = "";
	switch(cell.t) {
		case 'b': vv = cell.v ? "1" : "0"; break;
		case 'n': case 'e': vv = ''+cell.v; break;
		default: vv = cell.v; break;
	}
	var v = writetag('v', escapexml(vv)), o = {r:ref};
	/* TODO: cell style */
	var os = get_cell_style(opts.cellXfs, cell, opts);
	if(os !== 0) o.s = os;
	switch(cell.t) {
		case 's': case 'str':
			if(opts.bookSST) {
				v = writetag('v', ''+get_sst_id(opts.Strings, cell.v));
				o.t = "s"; break;
			}
			o.t = "str"; break;
		case 'n': break;
		case 'b': o.t = "b"; break;
		case 'e': o.t = "e"; break;
		case 'f':
			vv = cell.f;
			var f = writextag('f', escapexml(vv)); 
			v = f+v; break;
	}
	return writextag('c', v, o);
}

var parse_ws_xml_data = (function parse_ws_xml_data_factory() {
	var cellregex = /<(?:\w+:)?c /, rowregex = /<\/(?:\w+:)?row>/;
	var rregex = /r=["']([^"']*)["']/, isregex = /<is>([\S\s]*?)<\/is>/;
	var match_v = matchtag("v"), match_f = matchtag("f");

return function parse_ws_xml_data(sdata, s, opts, guess) {
	var ri = 0, x = "", cells = [], cref = [], idx = 0, i=0, cc=0, d="", p;
	var tag;
	var sstr;
	var fmtid = 0, fillid = 0, do_format = Array.isArray(styles.CellXf), cf;
	for(var marr = sdata.split(rowregex), mt = 0; mt != marr.length; ++mt) {
		x = marr[mt].trim();
		if(x.length === 0) continue;

		/* 18.3.1.73 row CT_Row */
		for(ri = 0; ri != x.length; ++ri) if(x.charCodeAt(ri) === 62) break; ++ri;
		tag = parsexmltag(x.substr(0,ri), true);
		if(opts.sheetRows && opts.sheetRows < +tag.r) continue;
		if(guess.s.r > tag.r - 1) guess.s.r = tag.r - 1;
		if(guess.e.r < tag.r - 1) guess.e.r = tag.r - 1;

		/* 18.3.1.4 c CT_Cell */
		cells = x.substr(ri).split(cellregex);
		for(ri = 0; ri != cells.length; ++ri) {
			x = cells[ri].trim();
			if(x.length === 0) continue;
			cref = x.match(rregex); idx = ri; i=0; cc=0;
			x = "<c " + x;
			if(cref !== null && cref.length === 2) {
				idx = 0; d=cref[1];
				for(i=0; i != d.length; ++i) {
					if((cc=d.charCodeAt(i)-64) < 1 || cc > 26) break;
					idx = 26*idx + cc;
				}
				--idx;
			}

			for(i = 0; i != x.length; ++i) if(x.charCodeAt(i) === 62) break; ++i;
			tag = parsexmltag(x.substr(0,i), true);
			d = x.substr(i);
			p = {t:""};

			if((cref=d.match(match_v))!== null) p.v=unescapexml(cref[1]);
			if(opts.cellFormula && (cref=d.match(match_f))!== null) p.f=unescapexml(cref[1]);

			/* SCHEMA IS ACTUALLY INCORRECT HERE.  IF A CELL HAS NO T, EMIT "" */
			if(tag.t === undefined && p.v === undefined) {
				if(!opts.sheetStubs) continue;
				p.t = "str";
			}
			else p.t = tag.t || "n";
			if(guess.s.c > idx) guess.s.c = idx;
			if(guess.e.c < idx) guess.e.c = idx;
			/* 18.18.11 t ST_CellType */
			switch(p.t) {
				case 'n': p.v = parseFloat(p.v); break;
				case 's':
					sstr = strs[parseInt(p.v, 10)];
					p.v = sstr.t;
					p.r = sstr.r;
					if(opts.cellHTML) p.h = sstr.h;
					break;
				case 'str': if(p.v != null) p.v = utf8read(p.v); else p.v = ""; break;
				case 'inlineStr':
					cref = d.match(isregex);
					p.t = 'str';
					if(cref !== null) { sstr = parse_si(cref[1]); p.v = sstr.t; } else p.v = "";
					break; // inline string
				case 'b': p.v = parsexmlbool(p.v); break;
				case 'd':
					p.v = datenum(p.v);
					p.t = 'n';
					break;
				/* in case of error, stick value in .raw */
				case 'e': p.raw = RBErr[p.v]; break;
			}
			/* formatting */
			fmtid = fillid = 0;
			if(do_format && tag.s !== undefined) {
				cf = styles.CellXf[tag.s];
				if(cf != null) {
					if(cf.numFmtId != null) fmtid = cf.numFmtId;
					if(opts.cellStyles && cf.fillId != undefined) fillid = cf.fillId;
				}
			}
			safe_format(p, fmtid, fillid, opts);
			s[tag.r] = p;
		}
	}
}; })();

function write_ws_xml_data(ws, opts, idx, wb) {
	var o = [], r = [], range = safe_decode_range(ws['!ref']), cell, ref, rr = "", cols = [];
	for(var R = range.s.r; R <= range.e.r; ++R) {
		r = [];
		rr = encode_row(R);
		for(var C = range.s.c; C <= range.e.c; ++C) {
			if(R === range.s.r) cols[C] = encode_col(C);
			ref = cols[C] + rr;
			if(!ws[ref]) continue;
			if((cell = write_ws_xml_cell(ws[ref], ref, ws, opts, idx, wb))) r.push(cell);
		}
		if(r.length) o[o.length] = (writextag('row', r.join(""), {r:rr}));
	}
	return o.join("");
}

var WS_XML_ROOT = writextag('worksheet', null, {
	'xmlns': XMLNS.main[0],
	'xmlns:r': XMLNS.r
});

function write_ws_xml(idx, opts, wb) {
	var o = [XML_HEADER, WS_XML_ROOT];
	var s = wb.SheetNames[idx], ws = wb.Sheets[s] || {}, sidx = 0, rdata = "";
	o[o.length] = (writextag('dimension', null, {'ref': ws['!ref'] || 'A1'}));
	if((ws['!cols']||[]).length > 0) o[o.length] = (write_ws_xml_cols(ws, ws['!cols']));
	sidx = o.length;
	o[o.length] = (writextag('sheetData', null));
	if(ws['!ref']) rdata = write_ws_xml_data(ws, opts, idx, wb);
	if(rdata.length) o[o.length] = (rdata);
	if(o.length>sidx+1) { o[o.length] = ('</sheetData>'); o[sidx]=o[sidx].replace("/>",">"); }
	if((ws['!cf']||[]).length > 0) o[o.length] = (write_ws_xml_cf(ws, opts, ws['!cf']));
	if(o.length>2) { o[o.length] = ('</worksheet>'); o[1]=o[1].replace("/>",">"); }
	return o.join("");
}
