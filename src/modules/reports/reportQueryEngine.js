// reportQueryEngine.js
import { supabase } from '../../lib/supabase';

// ── Deep flatten nested row ───────────────────────────────────
export function flattenRow(obj, prefix = '') {
  const flat = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      flat[full] = '';
    } else if (Array.isArray(value)) {
      flat[`${full}_count`] = value.length;
      if (value.length > 0 && typeof value[0] === 'object') {
        value.forEach((item, i) => {
          if (typeof item === 'object') Object.assign(flat, flattenRow(item, `${full}[${i}]`));
        });
      }
    } else if (typeof value === 'object') {
      Object.assign(flat, flattenRow(value, full));
    } else {
      flat[full] = value;
    }
  }
  return flat;
}

// ── Key → readable label ──────────────────────────────────────
export function keyToLabel(key) {
  const clean = key.replace(/\[\d+\]/g, '');
  const parts  = clean.split('.');
  return parts.slice(-2)
    .map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    .join(' › ');
}

// ── Formula engine ────────────────────────────────────────────
// Supports: =CONCAT(a,b), =IF(col>val,x,y), =LEN(col),
//           =UPPER(col), =LOWER(col), =col1+col2, =col*num
export function applyFormula(rows, formula, colName) {
  const f = formula.trim();

  // =CONCAT(a, b, ...)
  const concatM = f.match(/^=CONCAT\((.+)\)$/i);
  if (concatM) {
    const parts = concatM[1].split(',').map(p => p.trim().replace(/^['"]|['"]$/g, ''));
    return rows.map(row => {
      return parts.map(p => (p in row ? String(row[p] ?? '') : p)).join('');
    });
  }

  // =IF(col op val, true_val, false_val)
  const ifM = f.match(/^=IF\((.+?)(>|<|>=|<=|==|=|!=)(.+?),(.+?),(.+?)\)$/i);
  if (ifM) {
    const [, col, rawOp, rawVal, rawT, rawF] = ifM;
    const op  = rawOp === '=' ? '==' : rawOp;
    const val = isNaN(rawVal) ? rawVal.trim().replace(/^['"]|['"]$/g, '') : Number(rawVal);
    const tv  = isNaN(rawT)   ? rawT.trim().replace(/^['"]|['"]$/g, '')  : Number(rawT);
    const fv  = isNaN(rawF)   ? rawF.trim().replace(/^['"]|['"]$/g, '')  : Number(rawF);
    return rows.map(row => {
      const x = col.trim() in row ? row[col.trim()] : undefined;
      try { return eval(`${JSON.stringify(x)} ${op} ${JSON.stringify(val)}`) ? tv : fv; }
      catch { return fv; }
    });
  }

  // =LEN(col)
  const lenM = f.match(/^=LEN\((.+)\)$/i);
  if (lenM) {
    const col = lenM[1].trim();
    return rows.map(row => String(row[col] ?? '').length);
  }

  // =UPPER(col) / =LOWER(col)
  const caseM = f.match(/^=(UPPER|LOWER)\((.+)\)$/i);
  if (caseM) {
    const [, fn, col] = caseM;
    return rows.map(row => fn.toUpperCase() === 'UPPER'
      ? String(row[col.trim()] ?? '').toUpperCase()
      : String(row[col.trim()] ?? '').toLowerCase());
  }

  // =colA + colB  /  =colA * 2  etc.
  const mathM = f.match(/^=(.+?)\s*([+\-*/])\s*(.+)$/);
  if (mathM) {
    const [, a, op, b] = mathM;
    return rows.map(row => {
      const av = a.trim() in row ? parseFloat(row[a.trim()]) : parseFloat(a);
      const bv = b.trim() in row ? parseFloat(row[b.trim()]) : parseFloat(b);
      if (isNaN(av) || isNaN(bv)) return '';
      switch (op) {
        case '+': return av + bv;
        case '-': return av - bv;
        case '*': return av * bv;
        case '/': return bv !== 0 ? +(av / bv).toFixed(4) : '÷0';
        default: return '';
      }
    });
  }

  // Fallback: literal value
  return rows.map(() => formula);
}

// ── Aggregation engine ────────────────────────────────────────
export function calcAgg(values, aggType) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  const nums     = nonEmpty.map(v => parseFloat(v)).filter(n => !isNaN(n));
  switch (aggType) {
    case 'count':  return values.length;
    case 'filled': return nonEmpty.length;
    case 'empty':  return values.length - nonEmpty.length;
    case 'unique': return new Set(nonEmpty.map(String)).size;
    case 'sum':    return nums.length ? +nums.reduce((a, b) => a + b, 0).toFixed(4) : '—';
    case 'avg':    return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '—';
    case 'min':    return nums.length ? Math.min(...nums) : (nonEmpty.length ? nonEmpty[0] : '—');
    case 'max':    return nums.length ? Math.max(...nums) : (nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : '—');
    default: return '';
  }
}

// ── Client-side filters ───────────────────────────────────────
export function applyFilters(data, filters) {
  if (!filters?.length) return data;
  return data.filter(row =>
    filters.every(f => {
      if (!f.col) return true;
      const val = String(row[f.col] ?? '').toLowerCase();
      const fv  = String(f.val ?? '').toLowerCase();
      switch (f.op) {
        case 'contains':     return val.includes(fv);
        case 'not_contains': return !val.includes(fv);
        case 'equals':       return val === fv;
        case 'not_equals':   return val !== fv;
        case 'starts':       return val.startsWith(fv);
        case 'ends':         return val.endsWith(fv);
        case 'gt':           return parseFloat(row[f.col]) > parseFloat(f.val);
        case 'lt':           return parseFloat(row[f.col]) < parseFloat(f.val);
        case 'gte':          return parseFloat(row[f.col]) >= parseFloat(f.val);
        case 'lte':          return parseFloat(row[f.col]) <= parseFloat(f.val);
        case 'empty':        return !row[f.col] && row[f.col] !== 0;
        case 'filled':       return !!row[f.col] || row[f.col] === 0;
        default: return true;
      }
    })
  );
}

// ── Multi-sort ────────────────────────────────────────────────
export function applyMultiSort(data, sorts) {
  if (!sorts?.length) return data;
  return [...data].sort((a, b) => {
    for (const s of sorts) {
      if (!s.col) continue;
      const av = a[s.col], bv = b[s.col];
      if (av == null) return 1;
      if (bv == null) return -1;
      const na = parseFloat(av), nb = parseFloat(bv);
      const cmp = !isNaN(na) && !isNaN(nb)
        ? na - nb
        : String(av).localeCompare(String(bv), 'en-IN');
      if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

// ── Group + aggregate ─────────────────────────────────────────
export function applyGrouping(data, groupByKey, columns, aggCfg) {
  if (!groupByKey) return { grouped: false, data };

  const groups = {};
  data.forEach(row => {
    const gKey = String(row[groupByKey] ?? '(blank)');
    if (!groups[gKey]) groups[gKey] = { _groupKey: gKey, _rows: [] };
    groups[gKey]._rows.push(row);
  });

  const result = Object.values(groups).map(g => {
    const summary = {
      _isGroupRow: true,
      _rowCount: g._rows.length,
      [groupByKey]: g._groupKey,
    };
    columns.forEach(col => {
      if (col.key === groupByKey) return;
      const agg = aggCfg?.[col.key] || '';
      if (agg) {
        summary[col.key] = calcAgg(g._rows.map(r => r[col.key]), agg);
        summary[`_agg_${col.key}`] = agg; // store agg type for display
      } else {
        summary[col.key] = `(${g._rows.length})`;
      }
    });
    summary._rows = g._rows; // keep for sub-table expand
    return summary;
  });

  return { grouped: true, data: result };
}

// ── Main executor ─────────────────────────────────────────────
export async function executeDynamicQuery({ baseTable, selectString }) {
  if (!baseTable) throw new Error('No base table selected');
  const { data, error } = await supabase
    .from(baseTable)
    .select(selectString || '*')
    .limit(5000);
  if (error) throw error;

  const flatData = (data || []).map(row => flattenRow(row));
  const allKeys  = flatData.length > 0
    ? [...new Set(flatData.flatMap(r => Object.keys(r)))]
    : [];
  const columns  = allKeys.map(k => ({
    key:   k,
    label: keyToLabel(k),
    type:  k.endsWith('_count') ? 'number'
         : k.includes('_at') || k.includes('date') ? 'date'
         : 'text',
  }));

  return { data: flatData, columns };
}