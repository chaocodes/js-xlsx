var strs = {}; // shared strings
var _ssfopts = {}; // spreadsheet formatting options

RELS.WS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";

function get_sst_id(sst, str) {
	for(var i = 0; i != sst.length; ++i) if(sst[i].t === str) { sst.Count ++; return i; }
	sst[sst.length] = {t:str}; sst.Count ++; sst.Unique ++; return sst.length-1;
}

function get_cell_style(styles, cell, opts) {
	var z = opts.revssf[cell.z||cell.b||"General"];
	for(var i = 0; i != styles.length; ++i) if(styles[i].numFmtId === z || (cell.b && styles[i].fontId === 1 && styles[i].numFmtId === 0 && !z)) return i;
	styles[styles.length] = {
		numFmtId:z,
		fontId:0,
		fillId:0,
		borderId:0,
		xfId:0,
		applyNumberFormat:1
	};
	if (cell.b) styles[styles.length-1].fontId = 1;
	if (styles[styles.length-1].numFmtId === 0) styles[styles.length-1].applyNumberFormat = 0;
	return styles.length-1;
}

function get_dxf(dxfs, cf, opts) {
	var bg = cf.bg, it = cf.i, c = cf.c;
	for(var i = 0; i != dxfs.length; ++i) if(dxfs[i].bg === bg && dxfs[i].i === it && dxfs[i].c === c) return i;
	dxfs[dxfs.length] = cf;
	return dxfs.length-1;
}

function safe_format(p, fmtid, fillid, opts) {
	try {
		if(fmtid === 0) {
			if(p.t === 'n') {
				if((p.v|0) === p.v) p.w = SSF._general_int(p.v,_ssfopts);
				else p.w = SSF._general_num(p.v,_ssfopts);
			}
			else if(p.v === undefined) return "";
			else p.w = SSF._general(p.v,_ssfopts);
		}
		else p.w = SSF.format(fmtid,p.v,_ssfopts);
		if(opts.cellNF) p.z = SSF._table[fmtid];
	} catch(e) { if(opts.WTF) throw e; }
	if(fillid) try {
		p.s = styles.Fills[fillid];
		if (p.s.fgColor && p.s.fgColor.theme) {
			p.s.fgColor.rgb = rgb_tint(themes.themeElements.clrScheme[p.s.fgColor.theme].rgb, p.s.fgColor.tint || 0);
			if(opts.WTF) p.s.fgColor.raw_rgb = themes.themeElements.clrScheme[p.s.fgColor.theme].rgb;
		}
		if (p.s.bgColor && p.s.bgColor.theme) {
			p.s.bgColor.rgb = rgb_tint(themes.themeElements.clrScheme[p.s.bgColor.theme].rgb, p.s.bgColor.tint || 0);
			if(opts.WTF) p.s.bgColor.raw_rgb = themes.themeElements.clrScheme[p.s.bgColor.theme].rgb;
		}
	} catch(e) { if(opts.WTF) throw e; }
}
