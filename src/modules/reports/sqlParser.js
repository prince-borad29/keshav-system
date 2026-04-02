// ============================================================
// sqlParser.js
// Parses standard SQL SELECT statements into structured objects
// Used by QueryStudio visual builder + SQL validation
// ============================================================

/**
 * Parse a SQL SELECT statement into structured components
 * Handles: SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY, HAVING, LIMIT
 */
export function parseSQL(sql) {
  if (!sql?.trim()) return null;

  const cleaned = sql.replace(/\s+/g, ' ').trim();

  // Extract SELECT columns
  const selectMatch = cleaned.match(/SELECT\s+(.+?)\s+FROM\s/i);
  const selectCols = selectMatch
    ? splitTopLevel(selectMatch[1]).map(s => parseSelectColumn(s.trim()))
    : [{ expr: '*', alias: null }];

  // Extract FROM table
  const fromMatch = cleaned.match(/FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
  const from = fromMatch
    ? { table: fromMatch[1], alias: fromMatch[2] || fromMatch[1] }
    : null;

  // Extract JOINs
  const joins = [];
  const joinRegex = /(LEFT\s+|RIGHT\s+|INNER\s+|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+(.+?)(?=\s+(?:LEFT|RIGHT|INNER|FULL|CROSS|JOIN|WHERE|GROUP|ORDER|HAVING|LIMIT|$))/gi;
  let jm;
  while ((jm = joinRegex.exec(cleaned)) !== null) {
    joins.push({
      type: (jm[1] || 'INNER').trim().toUpperCase(),
      table: jm[2],
      alias: jm[3] || jm[2],
      on: jm[4].trim(),
    });
  }

  // Extract WHERE
  const whereMatch = cleaned.match(/WHERE\s+(.+?)(?=\s+(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)|$)/i);
  const where = whereMatch ? whereMatch[1].trim() : null;

  // Extract GROUP BY
  const groupMatch = cleaned.match(/GROUP\s+BY\s+(.+?)(?=\s+(?:HAVING|ORDER\s+BY|LIMIT)|$)/i);
  const groupBy = groupMatch
    ? groupMatch[1].split(',').map(s => s.trim())
    : [];

  // Extract HAVING
  const havingMatch = cleaned.match(/HAVING\s+(.+?)(?=\s+(?:ORDER\s+BY|LIMIT)|$)/i);
  const having = havingMatch ? havingMatch[1].trim() : null;

  // Extract ORDER BY
  const orderMatch = cleaned.match(/ORDER\s+BY\s+(.+?)(?=\s+LIMIT|$)/i);
  const orderBy = orderMatch
    ? orderMatch[1].split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return {
          column: parts[0],
          dir: (parts[1] || 'ASC').toUpperCase(),
        };
      })
    : [];

  // Extract LIMIT
  const limitMatch = cleaned.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;

  return {
    select: selectCols,
    from,
    joins,
    where,
    groupBy,
    having,
    orderBy,
    limit,
    raw: sql,
  };
}

/**
 * Parse a single SELECT column expression
 * e.g. "COUNT(m.id) as total" → { expr: "COUNT(m.id)", alias: "total" }
 * e.g. "m.name"              → { expr: "m.name",       alias: null }
 */
function parseSelectColumn(col) {
  const aliasMatch = col.match(/^(.+?)\s+(?:AS\s+)?(\w+)$/i);
  if (aliasMatch && !aliasMatch[1].includes('(') && aliasMatch[1].includes('.')) {
    // Simple: m.name alias
    return { expr: aliasMatch[1].trim(), alias: aliasMatch[2] };
  }
  // With function: COUNT(x) as alias
  const fnAlias = col.match(/^(.+\))\s+(?:AS\s+)?(\w+)$/i);
  if (fnAlias) return { expr: fnAlias[1].trim(), alias: fnAlias[2] };

  // Check simple alias without dot
  if (aliasMatch) return { expr: aliasMatch[1].trim(), alias: aliasMatch[2] };

  return { expr: col, alias: null };
}

/**
 * Split by comma but respect parentheses nesting
 * e.g. "COUNT(a.id), m.name" → ["COUNT(a.id)", "m.name"]
 */
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Build a SQL string from visual config
 */
export function buildSQLFromVisual(config) {
  const { baseTable, baseAlias, columns, joins, where, groupBy, orderBy, limit } = config;

  // SELECT
  const selectStr = columns.length > 0
    ? columns.map(c => {
        let expr = c.table ? `${c.table}.${c.column}` : c.column;
        if (c.aggregate) expr = `${c.aggregate}(${expr})`;
        if (c.alias) expr += ` AS ${c.alias}`;
        return expr;
      }).join(',\n  ')
    : '*';

  let sql = `SELECT\n  ${selectStr}\nFROM ${baseTable}${baseAlias && baseAlias !== baseTable ? ' ' + baseAlias : ''}`;

  // JOINs
  joins.forEach(j => {
    sql += `\n${j.type} JOIN ${j.table}${j.alias && j.alias !== j.table ? ' ' + j.alias : ''} ON ${j.on}`;
  });

  // WHERE
  if (where?.trim()) sql += `\nWHERE ${where}`;

  // GROUP BY
  if (groupBy.length > 0) sql += `\nGROUP BY ${groupBy.join(', ')}`;

  // ORDER BY
  if (orderBy.length > 0) {
    sql += `\nORDER BY ${orderBy.map(o => `${o.column} ${o.dir}`).join(', ')}`;
  }

  // LIMIT
  if (limit) sql += `\nLIMIT ${limit}`;

  return sql;
}

/**
 * Validate SQL for safety (client-side pre-check)
 */
export function validateSQL(sql) {
  if (!sql?.trim()) return { valid: false, error: 'Query is empty' };

  const lower = sql.toLowerCase().trim();

  if (!lower.startsWith('select')) {
    return { valid: false, error: 'Query must start with SELECT' };
  }

  const dangerous = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke'];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
      return { valid: false, error: `"${kw.toUpperCase()}" is not allowed. Only SELECT queries.` };
    }
  }

  if (!lower.includes('from')) {
    return { valid: false, error: 'Query must include a FROM clause' };
  }

  return { valid: true, error: null };
}

/**
 * Get table names referenced in a SQL string
 */
export function getReferencedTables(sql) {
  const tables = new Set();
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  if (fromMatch) tables.add(fromMatch[1]);

  const joinRegex = /JOIN\s+(\w+)/gi;
  let m;
  while ((m = joinRegex.exec(sql)) !== null) {
    tables.add(m[1]);
  }
  return [...tables];
}